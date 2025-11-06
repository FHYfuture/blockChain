import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import { connectWallet, Activity, BetInfo, SellOrder, formatBet, parseBet, BigNumber } from './ethers';
import { EasyBet, BetToken, BetTicket } from "../../contracts/typechain-types";
import { providers, Signer, ethers } from 'ethers'; // 修正 (v5): 导入 v5 类型

// 1. 创建 Ethers/Web3 上下文
interface Web3ContextType {
  connection: {
    provider: providers.Web3Provider; // 修正 (v5)
    signer: Signer;
    account: string;
    easyBet: EasyBet;
    betToken: BetToken;
    betTicket: BetTicket;
  } | null;
  notary: string;
  activities: Activity[];
  myTickets: { tokenId: BigNumber, info: BetInfo }[]; // 修正 (v5)
  sellOrders: SellOrder[];
  betBalance: string;
  refreshAll: () => void;
}

const Web3Ctx = createContext<Web3ContextType | null>(null);

function App() {
  const [connection, setConnection] = useState<Web3ContextType['connection']>(null);
  const [notary, setNotary] = useState<string>("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [myTickets, setMyTickets] = useState<Web3ContextType['myTickets']>([]);
  const [sellOrders, setSellOrders] = useState<SellOrder[]>([]);
  const [betBalance, setBetBalance] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  
  const account = connection?.account;

  const refreshAll = async () => {
    if (!connection) return;
    const { easyBet, betToken, betTicket, account } = connection;
    setLoading(true);

    try {
      // 1. 获取 Notary
      setNotary(await easyBet.notary());

      // 2. 获取余额
      const balance = await betToken.balanceOf(account);
      setBetBalance(formatBet(balance));

      // 3. 获取所有活动
      const activityCount = await easyBet._activityCounter();
      const acts: Activity[] = [];
      // 修正 (v5): 使用 .toNumber() 进行循环
      for (let i = 1; i <= activityCount.toNumber(); i++) {
        const actData = await easyBet.activities(i);
        
        // 获取动态的 totalAmountBetOnChoice
        const choicesWithBets = await Promise.all(actData.choices.map(async (choice, index) => {
            const amount = await easyBet.activities(i).totalAmountBetOnChoice(index);
            return { choice, amount };
        }));
        
        // 将合约原始数据和附加数据合并
        const act: Activity = {
            id: actData.id,
            description: actData.description,
            choices: actData.choices,
            endTime: actData.endTime,
            totalPool: actData.totalPool,
            resolved: actData.resolved,
            winningChoice: actData.winningChoice,
            choiceBets: choicesWithBets // 附加数据
        };
        acts.push(act);
      }
      setActivities(acts.reverse()); // 显示最新的

      // 4. 获取我的彩票
      const ticketBalance = await betTicket.balanceOf(account);
      const tickets: Web3ContextType['myTickets'] = [];
      // 修正 (v5): 使用 .toNumber() 进行循环
      for (let i = 0; i < ticketBalance.toNumber(); i++) {
        const tokenId = await betTicket.tokenOfOwnerByIndex(account, i);
        const info = await betTicket.ticketInfo(tokenId);
        tickets.push({ tokenId, info });
      }
      setMyTickets(tickets);

      // 5. 获取所有挂单
      const mySellOrders: SellOrder[] = [];
      for (const ticket of tickets) {
        const order = await easyBet.sellOrders(ticket.tokenId);
        // 修正 (v5): 使用 ethers.constants.AddressZero
        if (order.seller !== ethers.constants.AddressZero) {
          mySellOrders.push(order);
        }
      }
      setSellOrders(mySellOrders); // 简化：只显示我自己的挂单


    } catch (e) {
      console.error("Error refreshing data:", e);
    } finally {
      setLoading(false);
    }
  };
  
  const handleConnect = async () => {
    try {
      const conn = await connectWallet();
      setConnection(conn);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  useEffect(() => {
    if (connection) {
      refreshAll();
    }
  }, [connection]);


  return (
    <Web3Ctx.Provider value={{ connection, notary, activities, myTickets, sellOrders, betBalance, refreshAll }}>
      <div className="App">
        <header className="App-header">
          <h1>EasyBet - 去中心化竞猜</h1>
          {!account ? (
            <button onClick={handleConnect}>连接 MetaMask</button>
          ) : (
            <WalletInfo />
          )}
        </header>
        {loading && <p>Loading...</p>}
        {account && (
          <main>
            {account.toLowerCase() === notary.toLowerCase() && <NotaryAdmin />}
            <MyTickets />
            <ActivityList />
          </main>
        )}
      </div>
    </Web3Ctx.Provider>
  );
}

// --- 组件 ---

function WalletInfo() {
  const ctx = useContext(Web3Ctx)!;
  const { connection, betBalance, refreshAll } = ctx;

  const handleFaucet = async () => {
    try {
      const tx = await connection!.betToken.faucet();
      await tx.wait();
      alert("成功领取 1000 BET!");
      refreshAll();
    } catch (e) {
      console.error(e);
      alert("领取失败");
    }
  };

  return (
    <div className="wallet-info">
      <p>已连接: {connection?.account.substring(0, 6)}...{connection?.account.substring(38)}</p>
      <p>BET 余额: {betBalance}</p>
      <button onClick={handleFaucet}>[Bonus 1] 领取 BET 代币</button>
    </div>
  );
}

function NotaryAdmin() {
  const ctx = useContext(Web3Ctx)!;
  const [desc, setDesc] = useState("");
  const [choices, setChoices] = useState(""); // 逗号分隔
  const [endTime, setEndTime] = useState(""); // 分钟
  const [pool, setPool] = useState(""); // BET

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ctx.connection) return;

    try {
      const { easyBet, betToken } = ctx.connection;
      const choiceArray = choices.split(',').map(s => s.trim());
      const endTimeSeconds = Math.floor(Date.now() / 1000) + (parseInt(endTime) * 60);
      const poolAmount = parseBet(pool);

      // 1. Notary 授权
      const approveTx = await betToken.approve(await easyBet.getAddress(), poolAmount);
      await approveTx.wait();
      alert("授权成功，正在创建活动...");

      // 2. 创建活动
      const createTx = await easyBet.createActivity(desc, choiceArray, endTimeSeconds, poolAmount);
      await createTx.wait();
      
      alert("活动创建成功!");
      ctx.refreshAll();
    } catch (e) {
      console.error(e);
      alert("创建失败");
    }
  };

  return (
    <div className="component-box notary-admin">
      <h2>公证人后台</h2>
      <form onSubmit={handleCreate}>
        <h3>创建新活动</h3>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="活动描述" required />
        <input value={choices} onChange={e => setChoices(e.target.value)} placeholder="选项 (逗号分隔)" required />
        <input value={endTime} onChange={e => setEndTime(e.target.value)} type="number" placeholder="截止时间 (分钟后)" required />
        <input value={pool} onChange={e => setPool(e.target.value)} type="text" placeholder="初始奖池 (BET)" required />
        <button type="submit">创建活动</button>
      </form>
    </div>
  );
}

function ActivityList() {
  const ctx = useContext(Web3Ctx)!;
  return (
    <div className="component-box">
      <h2>竞猜活动列表</h2>
      {ctx.activities.map(act => (
        <ActivityCard key={act.id.toString()} activity={act} />
      ))}
    </div>
  );
}

function ActivityCard({ activity }: { activity: Activity }) {
  const ctx = useContext(Web3Ctx)!;
  const [amount, setAmount] = useState("");
  const [choice, setChoice] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const handleBet = async () => {
    if (!ctx.connection || !amount) return;
    setLoading(true);
    try {
      const { easyBet, betToken } = ctx.connection;
      const betAmount = parseBet(amount);

      // 1. 授权
      const approveTx = await betToken.approve(await easyBet.getAddress(), betAmount);
      await approveTx.wait();
      alert("授权成功，正在下注...");

      // 2. 下注
      const betTx = await easyBet.placeBet(activity.id, choice, betAmount);
      await betTx.wait();
      
      alert("下注成功!");
      setAmount("");
      ctx.refreshAll();
    } catch (e) {
      console.error(e);
      alert("下注失败");
    } finally {
      setLoading(false);
    }
  };
  
  const handleResolve = async () => {
    if (!ctx.connection) return;
    const winningChoice = prompt(`输入获胜选项 (0 - ${activity.choices.length - 1}):`);
    if (winningChoice === null) return;
    
    setLoading(true);
    try {
      await ctx.connection.easyBet.resolveActivity(activity.id, parseInt(winningChoice));
      alert("结算成功!");
      ctx.refreshAll();
    } catch (e) {
       console.error(e);
       alert("结算失败");
    } finally {
      setLoading(false);
    }
  };

  const isNotary = ctx.connection?.account.toLowerCase() === ctx.notary.toLowerCase();
  const isResolved = activity.resolved;
  // 修正 (v5): 使用 .toNumber()
  const winningChoiceStr = activity.choices[activity.winningChoice.toNumber()];
  const endTimeStr = new Date(activity.endTime.toNumber() * 1000).toLocaleString();

  return (
    <div className="activity-card">
      <h3>{activity.description} (ID: {activity.id.toString()})</h3>
      <p>总奖池: {formatBet(activity.totalPool)} BET</p>
      <p>状态: {isResolved ? `已结束 (获胜: ${winningChoiceStr})` : `进行中 (截止: ${endTimeStr})`}</p>

      {/* 显示每个选项的投注额 */}
      <div className="choice-bets">
        {activity.choiceBets?.map((cb, index) => (
            <p key={index} style={{fontSize: "0.9em", margin: "2px"}}>
                {cb.choice}: {formatBet(cb.amount)} BET
            </p>
        ))}
      </div>

      {/* 下注区域 */}
      {!isResolved && (
        <div className="bet-form">
          <select value={choice} onChange={e => setChoice(parseInt(e.target.value))}>
            {activity.choices.map((c, i) => (
              <option key={i} value={i}>{c}</option>
            ))}
          </select>
          <input 
            type="text" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            placeholder="BET 金额"
          />
          <button onClick={handleBet} disabled={loading}>{loading ? "处理中..." : "下注"}</button>
        </div>
      )}
      
      {/* 公证人结算按钮 */}
      {isNotary && !isResolved && (
        <button onClick={handleResolve} disabled={loading} style={{backgroundColor: 'darkred', marginTop: '10px'}}>
          {loading ? "结算中..." : "结算活动"}
        </button>
      )}
    </div>
  );
}

function MyTickets() {
  const ctx = useContext(Web3Ctx)!;
  const { myTickets, activities } = ctx;

  if (myTickets.length === 0) {
    return (
      <div className="component-box">
        <h2>我的彩票</h2>
        <p>你还没有任何彩票。</p>
      </div>
    );
  }

  return (
    <div className="component-box">
      <h2>我的彩票 ({myTickets.length})</h2>
      {myTickets.map(({ tokenId, info }) => {
        // 修正 (v5): 比较 BigNumber
        const activity = activities.find(a => a.id.eq(info.activityId));
        if (!activity) return null;
        
        return (
          <TicketCard 
            key={tokenId.toString()} 
            tokenId={tokenId} 
            info={info} 
            activity={activity} 
          />
        );
      })}
    </div>
  );
}

function TicketCard({ tokenId, info, activity }: { tokenId: BigNumber, info: BetInfo, activity: Activity }) {
  const ctx = useContext(Web3Ctx)!;
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  
  // 修正 (v5): 使用 .toNumber()
  const choiceStr = activity.choices[info.choiceIndex.toNumber()];
  let status = "进行中";
  let canClaim = false;

  if (activity.resolved) {
    // 修正 (v5): 比较 BigNumber
    if (info.choiceIndex.eq(activity.winningChoice)) {
      status = "已获胜";
      canClaim = true;
    } else {
      status = "未获胜";
    }
  }

  const handleClaim = async () => {
    if (!ctx.connection) return;
    setLoading(true);
    try {
      const tx = await ctx.connection.easyBet.claimWinnings(tokenId);
      await tx.wait();
      alert("奖金已领取!");
      ctx.refreshAll();
    } catch (e) {
      console.error(e);
      alert("领取失败");
    } finally {
      setLoading(false);
    }
  };

  const handleList = async () => {
    if (!ctx.connection || !price) return;
    setLoading(true);
    try {
      const { easyBet, betTicket } = ctx.connection;
      const listPrice = parseBet(price);

      // 1. 授权
      const approveTx = await betTicket.approve(await easyBet.getAddress(), tokenId);
      await approveTx.wait();
      alert("授权成功，正在挂单...");

      // 2. 挂单
      const listTx = await easyBet.listTicket(tokenId, listPrice);
      await listTx.wait();
      
      alert("挂单成功!");
      setPrice("");
      ctx.refreshAll();
    } catch (e) {
      console.error(e);
      alert("挂单失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ticket-card" style={{border: "1px solid #555", margin: "10px", padding: "10px"}}>
      <p><b>彩票 #{tokenId.toString()}</b> | 状态: {status}</p>
      <p>活动: {activity.description}</p>
      <p>你的选择: {choiceStr}</p>
      <p>下注金额: {formatBet(info.amount)} BET</p>

      {status === "进行中" && (
        <div className="ticket-actions">
          <input 
            type="text"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="售价 (BET)"
          />
          <button onClick={handleList} disabled={loading}>[Bonus 2] 挂单出售</button>
        </div>
      )}
      
      {canClaim && (
         <button onClick={handleClaim} disabled={loading} style={{backgroundColor: 'darkgreen'}}>
           {loading ? "领取中..." : "领取奖金"}
         </button>
      )}
    </div>
  );
}

export default App;