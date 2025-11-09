import { ethers, providers, Signer, BigNumber } from "ethers";

import { EasyBet, EasyBet__factory, BetToken, BetToken__factory, BetTicket, BetTicket__factory } from "./contracts/typechain-types";

const EASYBET_ADDRESS = "0x863cF9F7379b04aEDcC6F73429bb14258c5c1e48";
const BETTOKEN_ADDRESS = "0x1587F4b81DAee79151a0967ceC4566b86c62E1B6";
const BETTICKET_ADDRESS = "0x4768496bB505e98Dd86464A6642E4e0569f83135";


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