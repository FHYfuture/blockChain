import React, { useState, useEffect, createContext, useContext } from 'react';
import './App.css';
import { connectWallet, Activity, BetInfo, SellOrder, BigNumber, ethers } from './ethers';
import { EasyBet, BetToken, BetTicket } from "./contracts/typechain-types";
import { providers, Signer } from 'ethers'; 

// 1. 创建 Ethers/Web3 上下文
interface Web3ContextType {
  connection: {
    provider: providers.Web3Provider;
    signer: Signer;
    account: string;
    easyBet: EasyBet;
    betToken: BetToken;
    betTicket: BetTicket;
  } | null;
  notary: string;
  activities: Activity[];
  myTickets: { tokenId: BigNumber, info: BetInfo }[];
  allSellOrders: SellOrder[];
  betBalance: string;
  refreshAll: () => void;
}

const Web3Ctx = createContext<Web3ContextType | null>(null);

function App() {
  const [connection, setConnection] = useState<Web3ContextType['connection']>(null);
  const [notary, setNotary] = useState<string>("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [myTickets, setMyTickets] = useState<Web3ContextType['myTickets']>([]);
  const [allSellOrders, setAllSellOrders] = useState<SellOrder[]>([]);
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
      setBetBalance(ethers.utils.formatEther(balance));

      // 3. 获取所有活动
      const activityCount = await easyBet._activityCounter();
      const acts: Activity[] = [];
      
      for (let i = 1; i <= activityCount.toNumber(); i++) {
        const actData = await easyBet.getActivity(i);
        
        const choicesWithBets = await Promise.all(actData.choices.map(async (choice, index) => {
            const amount = await easyBet.getChoiceBetAmount(i, index);
            return { choice, amount };
        }));
        
        const act: Activity = {
            id: actData.id,
            description: actData.description,
            choices: actData.choices,
            endTime: actData.endTime,
            totalPool: actData.totalPool,
            resolved: actData.resolved,
            winningChoice: actData.winningChoice,
            choiceBets: choicesWithBets
        };
        acts.push(act);
      }
      setActivities(acts.reverse()); 

      // 4. 获取我的彩票
      const ticketBalance = await betTicket.balanceOf(account);
      const tickets: Web3ContextType['myTickets'] = [];
      for (let i = 0; i < ticketBalance.toNumber(); i++) {
        const tokenId = await betTicket.tokenOfOwnerByIndex(account, i);
        const [activityId, choiceIndex, amount] = await betTicket.ticketInfo(tokenId);
        tickets.push({ tokenId, info: { activityId, choiceIndex, amount } });
      }
      setMyTickets(tickets);

      // 5. [Bonus 2] 获取所有挂单
      const listedTokenIds = await easyBet.getListedTokenIds();
      const orders = await Promise.all(
        listedTokenIds.map(async (tokenId) => {
          
          const orderData = await easyBet.sellOrders(tokenId);
          
          if (orderData.seller === ethers.constants.AddressZero) {
            return null; // 订单可能刚刚被成交
          }
          
          return {
            tokenId: tokenId, 
            seller: orderData.seller,
            price: orderData.price
          } as SellOrder; 
        })
      );
      
      const validOrders = orders
        .filter((o): o is SellOrder => o !== null)
        // [!!! BUG 修复 !!!]
        // 使用 .sub(b.price).toNumber() 会在价格差异过大时导致溢出 (Overflow)
        // 必须使用 .gt() (greater than) 或 .lt() (less than) 来比较 BigNumber
        .sort((a, b) => {
            if (a.price.lt(b.price)) {
                return -1; // a 在前
            }
            if (a.price.gt(b.price)) {
                return 1; // b 在前
            }
            return 0; // 相等
        }); 

      setAllSellOrders(validOrders);

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
    <Web3Ctx.Provider value={{ connection, notary, activities, myTickets, allSellOrders, betBalance, refreshAll }}>
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
            <OrderBook />
            <MyTickets />
            <ActivityList />
          </main>
        )}
      </div>
    </Web3Ctx.Provider>
  );
}

// --- (所有其他组件 WalletInfo, NotaryAdmin, ActivityList, ActivityCard, MyTickets, TicketCard, OrderBook 保持不变) ---
// --- 您不需要修改它们 ---


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
      
      const poolAmount = ethers.utils.parseEther(pool);

      const approveTx = await betToken.approve(easyBet.address, poolAmount);
      await approveTx.wait();
      alert("授权成功，正在创建活动...");

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
      const betAmount = ethers.utils.parseEther(amount);

      const approveTx = await betToken.approve(easyBet.address, betAmount);
      await approveTx.wait();
      alert("授权成功，正在下注...");

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
  const winningChoiceStr = activity.choices[activity.winningChoice.toNumber()];
  const endTimeStr = new Date(activity.endTime.toNumber() * 1000).toLocaleString();

  return (
    <div className="activity-card">
      <h3>{activity.description} (ID: {activity.id.toString()})</h3>
      <p>总奖池: {ethers.utils.formatEther(activity.totalPool)} BET</p>
      <p>状态: {isResolved ? `已结束 (获胜: ${winningChoiceStr})` : `进行中 (截止: ${endTimeStr})`}</p>

      <div className="choice-bets">
        {activity.choiceBets?.map((cb: { choice: string, amount: BigNumber }, index: number) => (
            <p key={index} style={{fontSize: "0.9em", margin: "2px"}}>
                {cb.choice}: {ethers.utils.formatEther(cb.amount)} BET
            </p>
        ))}
      </div>

      {!isResolved && (
        <div className="bet-form">
          <select value={choice} onChange={e => setChoice(parseInt(e.target.value))}>
            {activity.choices.map((c: string, i: number) => (
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
  
  const choiceStr = activity.choices[info.choiceIndex.toNumber()];
  let status = "进行中";
  let canClaim = false;

  if (activity.resolved) {
    if (info.choiceIndex.eq(activity.winningChoice)) {
      status = "已获胜";
      canClaim = true;
    } else {
      status = "未获胜";
    }
  }
  
  // 检查这张票是否已挂单
  const isListed = ctx.allSellOrders.some(order => order.tokenId.eq(tokenId));

  const handleClaim = async () => {
    // ... (代码无变化) ...
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
    // ... (代码无变化) ...
    if (!ctx.connection || !price) return;
    setLoading(true);
    try {
      const { easyBet, betTicket } = ctx.connection;
      const listPrice = ethers.utils.parseEther(price);

      const approveTx = await betTicket.approve(easyBet.address, tokenId);
      await approveTx.wait();
      alert("授权成功，正在挂单...");

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

  // 新增: 取消挂单
  const handleUnlist = async () => {
    if (!ctx.connection) return;
    setLoading(true);
    try {
      const tx = await ctx.connection.easyBet.unlistTicket(tokenId);
      await tx.wait();
      alert("取消挂单成功!");
      ctx.refreshAll();
    } catch (e) {
      console.error(e);
      alert("取消挂单失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ticket-card" style={{border: "1px solid #555", margin: "10px", padding: "10px"}}>
      <p><b>彩票 #{tokenId.toString()}</b> | 状态: {status}</p>
      <p>活动: {activity.description}</p>
      <p>你的选择: {choiceStr}</p>
      <p>下注金额: {ethers.utils.formatEther(info.amount)} BET</p>

      {/* 修正: 挂单/取消挂单 逻辑 */}
      {status === "进行中" && (
        <div className="ticket-actions">
          {isListed ? (
            <button onClick={handleUnlist} disabled={loading} style={{backgroundColor: 'darkorange'}}>
              {loading ? "..." : "取消挂单"}
            </button>
          ) : (
            <>
              <input 
                type="text"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="售价 (BET)"
              />
              <button onClick={handleList} disabled={loading}>[Bonus 2] 挂单出售</button>
            </>
          )}
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

// --- 新增 [Bonus 2] 订单簿组件 ---

function OrderBook() {
  const ctx = useContext(Web3Ctx)!;
  const { allSellOrders, connection, activities, refreshAll } = ctx;
  const [loading, setLoading] = useState<string>(""); // 存储正在加载的 tokenId

  // 过滤掉我们自己的挂单
  const ordersToShow = allSellOrders.filter(
    order => order.seller.toLowerCase() !== connection?.account.toLowerCase()
  );

  if (ordersToShow.length === 0) {
    return (
      <div className="component-box">
        <h2>彩票市场 (订单簿)</h2>
        <p>当前没有其他人在出售彩票。</p>
      </div>
    );
  }

  const handleBuy = async (order: SellOrder) => {
    if (!connection) return;
    setLoading(order.tokenId.toString());
    try {
      const { easyBet, betToken } = connection;
      
      // 1. 授权
      const approveTx = await betToken.approve(easyBet.address, order.price);
      await approveTx.wait();
      alert("授权成功，正在购买...");

      // 2. 购买
      const buyTx = await easyBet.buyTicket(order.tokenId);
      await buyTx.wait();

      alert(`成功购买彩票 #${order.tokenId.toString()}!`);
      refreshAll();
    } catch (e) {
      console.error(e);
      alert("购买失败");
    } finally {
      setLoading("");
    }
  };
  
  // 帮助函数，用于查找彩票信息
  const getTicketDesc = (tokenId: BigNumber) => {
    // 在真实应用中，我们会批量获取或缓存这些信息
    // 为简单起见，我们暂时只显示 tokenId
    // (因为在 App.tsx 中获取 ticketInfo 比较麻烦)
    return `彩票 #${tokenId.toString()}`;
  };

  return (
    <div className="component-box" style={{backgroundColor: '#2c3e50'}}>
      <h2>彩票市场 (订单簿) [Bonus 2]</h2>
      <p>按最优价格（最低价）排序：</p>
      {ordersToShow.map((order) => {
        const isLoading = loading === order.tokenId.toString();
        return (
          <div key={order.tokenId.toString()} className="ticket-card" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <p><b>{getTicketDesc(order.tokenId)}</b></p>
              <p>价格: {ethers.utils.formatEther(order.price)} BET</p>
              <p style={{fontSize: '0.8em'}}>卖家: {order.seller.substring(0, 6)}...</p>
            </div>
            <button onClick={() => handleBuy(order)} disabled={isLoading} style={{backgroundColor: 'darkgreen'}}>
              {isLoading ? "处理中..." : "购买"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default App;