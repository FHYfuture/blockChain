import { ethers, providers, Signer, BigNumber } from "ethers";
// 自动从 'contracts/typechain-types' 导入
import { EasyBet, EasyBet__factory, BetToken, BetToken__factory, BetTicket, BetTicket__factory } from "../../contracts/typechain-types";

// --- 合约地址 (请在部署后修改为你自己的地址) ---
// 运行 `npx hardhat run scripts/deploy.ts --network ganache` 后填入
const EASYBET_ADDRESS = "0x7873d9e4c24873dB65eF7CFf04CD96cd5f6C771A";
const BETTOKEN_ADDRESS = "0xe299E81692C07512e789d7425604A350e5853eD8";
const BETTICKET_ADDRESS = "0xcBB0f4948C88BAe6bD1BA5f3841D4E0781ec8526";
// --------------------------------------------------

export { BigNumber }; // 导出 BigNumber 供 React 组件使用

interface EthersConnection {
  provider: providers.Web3Provider;
  signer: Signer;
  account: string;
  easyBet: EasyBet;
  betToken: BetToken;
  betTicket: BetTicket;
}

export const connectWallet = async (): Promise<EthersConnection> => {
  if (typeof window.ethereum === "undefined") {
    throw new Error("MetaMask is not installed!");
  }

  // 修正 (v5): 使用 providers.Web3Provider
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  
  // 请求账户
  const accounts = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];
  
  // 修正 (v5): .getSigner() 是同步的
  const signer = provider.getSigner(account);

  // 实例化合约
  const easyBet = EasyBet__factory.connect(EASYBET_ADDRESS, signer);
  const betToken = BetToken__factory.connect(BETTOKEN_ADDRESS, signer);
  const betTicket = BetTicket__factory.connect(BETTICKET_ADDRESS, signer);

  return { provider, signer, account, easyBet, betToken, betTicket };
};

// 帮助函数
// 修正 (v5): 使用 ethers.utils.formatEther
export const formatBet = (bn: BigNumber) => ethers.utils.formatEther(bn);
// 修正 (v5): 使用 ethers.utils.parseEther
export const parseBet = (s: string) => ethers.utils.parseEther(s);

// 用于存储从合约读取的结构体类型
// 修正 (v5): 合约返回 BigNumber, 不是 bigint
export interface Activity {
  id: BigNumber;
  description: string;
  choices: string[];
  endTime: BigNumber;
  totalPool: BigNumber;
  resolved: boolean;
  winningChoice: BigNumber;
  // 用于在前端附加每个选项的投注额
  choiceBets?: { choice: string, amount: BigNumber }[];
}

export interface BetInfo {
  activityId: BigNumber;
  choiceIndex: BigNumber;
  amount: BigNumber;
}

export interface SellOrder {
    tokenId: BigNumber;
    seller: string;
    price: BigNumber;
}