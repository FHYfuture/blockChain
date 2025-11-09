
import { ethers, providers, Signer, BigNumber } from "ethers";
// 修正 1: 从本地路径导入，以满足 Create React App
import { EasyBet, EasyBet__factory, BetToken, BetToken__factory, BetTicket, BetTicket__factory } from "./contracts/typechain-types";

// --- 合约地址 (请在部署后修改为你自己的地址) ---
// 粘贴你刚刚在“第 2 步”中复制的新地址
const EASYBET_ADDRESS = "0xc4F7F5f4db7c6041289A8BdF8CeADC8950Eb69cD";
const BETTOKEN_ADDRESS = "0xbABB33b260C7D3b2DeB09F01db08545c7E7ac73b";
const BETTICKET_ADDRESS = "0xd81F0a7c1A8549152105508DbDbea8c735B0d94C";

// --------------------------------------------------

export { BigNumber, ethers }; 

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

  const provider = new ethers.providers.Web3Provider(window.ethereum);

  const accounts = await provider.send("eth_requestAccounts", []);
  const account = accounts[0];

  const signer = provider.getSigner(account);

  // 实例化合约
  const easyBet = EasyBet__factory.connect(EASYBET_ADDRESS, signer);
  const betToken = BetToken__factory.connect(BETTOKEN_ADDRESS, signer);
  const betTicket = BetTicket__factory.connect(BETTICKET_ADDRESS, signer);

  return { provider, signer, account, easyBet, betToken, betTicket };
};

// 修正 2: 这是从我们新的 EasyBet.sol 中 getActivity() 返回的类型
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