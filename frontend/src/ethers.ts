
import { ethers, providers, Signer, BigNumber } from "ethers";
// 修正 1: 从本地路径导入，以满足 Create React App
import { EasyBet, EasyBet__factory, BetToken, BetToken__factory, BetTicket, BetTicket__factory } from "./contracts/typechain-types";

// --- 合约地址 (请在部署后修改为你自己的地址) ---
// 粘贴你刚刚在“第 2 步”中复制的新地址
const EASYBET_ADDRESS = "0xc7D8597e99Fa525dEF8e99F3B47c5CA93699232E";
const BETTOKEN_ADDRESS = "0xbc3085dc3C22f72322618c5a890b75F4fA098B5C";
const BETTICKET_ADDRESS = "0x1262d14b39cFB10fFa838F68811c9e1cec794804";

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