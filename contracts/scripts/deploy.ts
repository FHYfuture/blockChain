import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy BetToken (ERC20)
  const BetTokenFactory = await ethers.getContractFactory("BetToken");
  const betToken = await BetTokenFactory.deploy();
  await betToken.deployed(); 
  const betTokenAddress = betToken.address;
  console.log(`BetToken (ERC20) deployed to ${betTokenAddress}`);

  // 2. Deploy BetTicket (ERC721)
  const BetTicketFactory = await ethers.getContractFactory("BetTicket");
  const betTicket = await BetTicketFactory.deploy();
  await betTicket.deployed(); 

  const betTicketAddress = betTicket.address;
  console.log(`BetTicket (ERC721) deployed to ${betTicketAddress}`);

  // 3. Deploy EasyBet (Main Contract)
  const EasyBetFactory = await ethers.getContractFactory("EasyBet");
  const easyBet = await EasyBetFactory.deploy(betTokenAddress, betTicketAddress);
  await easyBet.deployed(); 
  const easyBetAddress = easyBet.address;
  console.log(`EasyBet deployed to ${easyBetAddress}`);

  // 4. Transfer ownership of BetTicket to EasyBet contract
  console.log("Transferring ownership of BetTicket to EasyBet...");
  const tx = await betTicket.transferOwnership(easyBetAddress);
  await tx.wait();
  console.log("Ownership transferred.");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});