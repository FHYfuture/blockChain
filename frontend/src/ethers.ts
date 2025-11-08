
import { ethers, providers, Signer, BigNumber } from "ethers";
// 修正 1: 从本地路径导入，以满足 Create React App
import { EasyBet, EasyBet__factory, BetToken, BetToken__factory, BetTicket, BetTicket__factory } from "./contracts/typechain-types";

// --- 合约地址 (请在部署后修改为你自己的地址) ---
// 粘贴你刚刚在“第 2 步”中复制的新地址
const EASYBET_ADDRESS = "0x1740BBdC2ce8172A9739BaFdb610492445F049Fc";
const BETTOKEN_ADDRESS = "0x27Bd3ee2D303Cb51b494BbFB730F3118A1e92fEb";
const BETTICKET_ADDRESS = "0x9665C62dBCF5A584FdCb63118738Ca5B30c8DF0f";

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