import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";

interface DeployedContracts {
  easyBet: Contract;
  betToken: Contract;
  betTicket: Contract;
  notary: any;
  player1: any;
  player2: any;
}

describe("EasyBet", function () {
  async function deployFixture(): Promise<DeployedContracts> {
    const [notary, player1, player2] = await ethers.getSigners();

    // Deploy BetToken
    const BetTokenFactory = await ethers.getContractFactory("BetToken", notary);
    const betToken = await BetTokenFactory.deploy();
    await betToken.deployed(); 
    const betTokenAddress = betToken.address; 

    // Deploy BetTicket
    const BetTicketFactory = await ethers.getContractFactory("BetTicket", notary);
    const betTicket = await BetTicketFactory.deploy();
    await betTicket.deployed(); 
    const betTicketAddress = betTicket.address; 

    // Deploy EasyBet
    const EasyBetFactory = await ethers.getContractFactory("EasyBet", notary);
    const easyBet = await EasyBetFactory.deploy(betTokenAddress, betTicketAddress);
    await easyBet.deployed(); 
    const easyBetAddress = easyBet.address; 

    // Transfer BetTicket ownership to EasyBet
    await betTicket.connect(notary).transferOwnership(easyBetAddress);

    await betToken.connect(player1).faucet();
    await betToken.connect(player2).faucet();

    await betToken.connect(notary).faucet();

    return { easyBet, betToken, betTicket, notary, player1, player2 };
  }

  describe("Deployment", function () {
    it("Should set the right notary", async function () {
      const { easyBet, notary } = await loadFixture(deployFixture);
      expect(await easyBet.notary()).to.equal(await notary.getAddress());
    });

    it("Should set the right token addresses", async function () {
      const { easyBet, betToken, betTicket } = await loadFixture(deployFixture);
      expect(await easyBet.betToken()).to.equal(betToken.address);
      expect(await easyBet.betTicket()).to.equal(betTicket.address);
    });

    it("EasyBet should be the owner of BetTicket", async function () {
      const { easyBet, betTicket } = await loadFixture(deployFixture);
      expect(await betTicket.owner()).to.equal(easyBet.address);
    });
  });

  describe("Full Flow", function () {
    let contracts: DeployedContracts;
    const activityId = 1;
    const choiceA = 0; 
    const choiceB = 1;

    beforeEach(async function () {
      contracts = await loadFixture(deployFixture);
      const { easyBet, betToken, notary } = contracts;
      const block = await ethers.provider.getBlock("latest");
      if (!block) throw new Error("Could not get latest block");

      const endTime = block.timestamp + 3600; // 1 hour from now
      const initialPool = ethers.utils.parseEther("100"); // 100 BET

      // Notary approves EasyBet to spend tokens
      await betToken.connect(notary).approve(easyBet.address, initialPool);

      // Notary creates an activity
      await easyBet
        .connect(notary)
        .createActivity(
          "Team A vs Team B",
          ["Team A", "Team B"],
          endTime,
          initialPool
        );
    });

    it("Should allow a player to place a bet", async function () {
      const { easyBet, betToken, betTicket, player1 } = contracts;
      const betAmount = ethers.utils.parseEther("50");

      // Player 1 approves EasyBet to spend tokens
      await betToken.connect(player1).approve(easyBet.address, betAmount);

      // Player 1 places bet
      await expect(
        easyBet.connect(player1).placeBet(activityId, choiceA, betAmount)
      )
        .to.emit(easyBet, "BetPlaced")
        .withArgs(activityId, (await player1.getAddress()), choiceA, betAmount, 1); 

      const activity = await easyBet.getActivity(activityId);
      expect(activity.totalPool).to.equal(ethers.utils.parseEther("150")); 
      
      // Check ERC721 ticket
      expect(await betTicket.ownerOf(1)).to.equal(await player1.getAddress());
      const [ticketActivityId, ticketChoiceIndex, ticketAmount] = await betTicket.ticketInfo(1);
      expect(ticketActivityId).to.equal(activityId);
      expect(ticketChoiceIndex).to.equal(choiceA);
      expect(ticketAmount).to.equal(betAmount);
    });

    it("Should allow resolving and claiming winnings", async function () {
      const { easyBet, betToken, betTicket, player1, player2, notary } = contracts;
      const betAmount1 = ethers.utils.parseEther("50"); 
      const betAmount2 = ethers.utils.parseEther("100"); 

      // Approvals
      await betToken.connect(player1).approve(easyBet.address, betAmount1);
      await betToken.connect(player2).approve(easyBet.address, betAmount2);

      // Bets
      await easyBet.connect(player1).placeBet(activityId, choiceA, betAmount1); // tokenId 1
      await easyBet.connect(player2).placeBet(activityId, choiceA, betAmount2); // tokenId 2
      
      // Notary resolves
      await easyBet.connect(notary).resolveActivity(activityId, choiceA); 

      // Player 1 claims
      const p1InitialBalance = await betToken.balanceOf(await player1.getAddress());
      await easyBet.connect(player1).claimWinnings(1); // TokenId 1
      const p1FinalBalance = await betToken.balanceOf(await player1.getAddress());
      const p1Winnings = (ethers.utils.parseEther("50").mul(ethers.utils.parseEther("250"))).div(ethers.utils.parseEther("150"));
      expect(p1FinalBalance).to.equal(p1InitialBalance.add(p1Winnings));

      // Player 2 claims
      const p2InitialBalance = await betToken.balanceOf(await player2.getAddress());
      await easyBet.connect(player2).claimWinnings(2); // TokenId 2
      const p2FinalBalance = await betToken.balanceOf(await player2.getAddress());
      const p2Winnings = (ethers.utils.parseEther("100").mul(ethers.utils.parseEther("250"))).div(ethers.utils.parseEther("150"));
      expect(p2FinalBalance).to.equal(p2InitialBalance.add(p2Winnings));
      
      // Check tickets are burned
      await expect(betTicket.ownerOf(1)).to.be.revertedWith("ERC721: invalid token ID");
      await expect(betTicket.ownerOf(2)).to.be.revertedWith("ERC721: invalid token ID");
    });
    
    it("Should not allow claiming for losing ticket", async function () {
      const { easyBet, betToken, player1, notary } = contracts;
      const betAmount = ethers.utils.parseEther("50");
      
      await betToken.connect(player1).approve(easyBet.address, betAmount);
      await easyBet.connect(player1).placeBet(activityId, choiceB, betAmount); 
      
      await easyBet.connect(notary).resolveActivity(activityId, choiceA); 
      
      await expect(easyBet.connect(player1).claimWinnings(1)).to.be.revertedWith("EasyBet: Not a winning ticket");
    });

    it("Should allow listing and buying a ticket [Bonus 2]", async function () {
      const { easyBet, betToken, betTicket, player1, player2 } = contracts;
      const p1BetAmount = ethers.utils.parseEther("50");
      const listPrice = ethers.utils.parseEther("75");

      // P1 places bet on A
      await betToken.connect(player1).approve(easyBet.address, p1BetAmount);
      await easyBet.connect(player1).placeBet(activityId, choiceA, p1BetAmount); // tokenId 1
      
      // P1 lists ticket for sale
      await betTicket.connect(player1).approve(easyBet.address, 1); 
      await easyBet.connect(player1).listTicket(1, listPrice);
      
      const order = await easyBet.sellOrders(1);
      expect(order.seller).to.equal(await player1.getAddress());
      expect(order.price).to.equal(listPrice);

      // P2 approves contract to spend BET tokens
      await betToken.connect(player2).approve(easyBet.address, listPrice);

      const p1BalanceBefore = await betToken.balanceOf(await player1.getAddress());
      const p2BalanceBefore = await betToken.balanceOf(await player2.getAddress());

      // P2 buys ticket
      await easyBet.connect(player2).buyTicket(1);

      // Check ownership
      expect(await betTicket.ownerOf(1)).to.equal(await player2.getAddress());
      
      // Check balances
      const p1BalanceAfter = await betToken.balanceOf(await player1.getAddress());
      const p2BalanceAfter = await betToken.balanceOf(await player2.getAddress());
      
      expect(p1BalanceAfter).to.equal(p1BalanceBefore.add(listPrice));
      expect(p2BalanceAfter).to.equal(p2BalanceBefore.sub(listPrice));

      // Check order is deleted
      const orderAfter = await easyBet.sellOrders(1);
      expect(orderAfter.seller).to.equal(ethers.constants.AddressZero);
    });
  });
});