// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "./BetToken.sol";
import "./BetTicket.sol";
// 修正: 确保使用 v4.x 的 SafeMath
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

/**
 * @title EasyBet
 * @dev Main contract for creating betting activities, placing bets,
 * trading tickets (ERC721), and claiming winnings.
 */
contract EasyBet {
    using SafeMath for uint256;

    // --- State Variables ---

    address public immutable notary;
    BetToken public immutable betToken;
    BetTicket public immutable betTicket;

    uint256 private _activityCounter;

    // Main struct to store betting activity details
    struct Activity {
        uint256 id;
        string description;
        string[] choices;
        uint256 endTime;
        uint256 totalPool;
        mapping(uint256 => uint256) totalAmountBetOnChoice;
        bool resolved;
        uint256 winningChoice;
    }

    // Struct for the ERC721 ticket order book [Bonus 2]
    struct SellOrder {
        uint256 tokenId;
        address seller;
        uint256 price;
    }

    mapping(uint256 => Activity) public activities;
    
    // Mapping from a tokenId to its sell order [Bonus 2]
    mapping(uint256 => SellOrder) public sellOrders;

    // --- Events ---

    event ActivityCreated(
        uint256 indexed activityId,
        string description,
        string[] choices,
        uint256 endTime,
        uint256 initialPool
    );
    event BetPlaced(
        uint256 indexed activityId,
        address indexed player,
        uint256 choiceIndex,
        uint256 amount,
        uint256 tokenId
    );
    event ActivityResolved(uint256 indexed activityId, uint256 winningChoice);
    event WinningsClaimed(
        uint256 indexed tokenId,
        address indexed player,
        uint256 amount
    );
    event TicketListed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price
    );
    event TicketUnlisted(uint256 indexed tokenId);
    event TicketSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );

    // --- Constructor ---

    constructor(address _betTokenAddress, address _betTicketAddress) {
        notary = msg.sender;
        betToken = BetToken(_betTokenAddress);
        betTicket = BetTicket(_betTicketAddress);
    }

    // --- Modifiers ---

    modifier onlyNotary() {
        require(msg.sender == notary, "EasyBet: Only notary can call this");
        _;
    }

    // --- Notary Functions ---

    /**
     * @dev Creates a new betting activity.
     * @param _description High-level description (e.g., "F1 Champion 2025").
     * @param _choices Array of possible outcomes (e.g., ["Verstappen", "Hamilton"]).
     * @param _endTime Timestamp when betting closes.
     * @param _initialPoolAmount Amount of BetToken the notary adds to the pool.
     */
    function createActivity(
        string calldata _description,
        string[] calldata _choices,
        uint256 _endTime,
        uint256 _initialPoolAmount
    ) external onlyNotary {
        require(_choices.length >= 2, "EasyBet: Must have at least 2 choices");
        require(_endTime > block.timestamp, "EasyBet: End time must be in the future");

        // Transfer initial pool from notary
        if (_initialPoolAmount > 0) {
            bool success = betToken.transferFrom(
                msg.sender,
                address(this),
                _initialPoolAmount
            );
            require(success, "EasyBet: Initial pool transfer failed");
        }

        _activityCounter++;
        uint256 activityId = _activityCounter;

        Activity storage newActivity = activities[activityId];
        newActivity.id = activityId;
        newActivity.description = _description;
        newActivity.endTime = _endTime;
        newActivity.totalPool = _initialPoolAmount;
        newActivity.resolved = false;

        for (uint256 i = 0; i < _choices.length; i++) {
            newActivity.choices.push(_choices[i]);
        }

        emit ActivityCreated(
            activityId,
            _description,
            _choices,
            _endTime,
            _initialPoolAmount
        );
    }

    /**
     * @dev Resolves a betting activity by setting the winning choice.
     */
    function resolveActivity(
        uint256 _activityId,
        uint256 _winningChoice
    ) external onlyNotary {
        Activity storage activity = activities[_activityId];
        require(activity.id != 0, "EasyBet: Activity does not exist");
        require(!activity.resolved, "EasyBet: Activity already resolved");
        require(
            _winningChoice < activity.choices.length,
            "EasyBet: Invalid winning choice"
        );

        activity.resolved = true;
        activity.winningChoice = _winningChoice;

        emit ActivityResolved(_activityId, _winningChoice);
    }

    // --- Player Functions ---

    /**
     * @dev Places a bet on a specific choice in an activity.
     * Mints an ERC721 ticket to the player.
     */
    function placeBet(
        uint256 _activityId,
        uint256 _choiceIndex,
        uint256 _amount
    ) external {
        Activity storage activity = activities[_activityId];
        require(activity.id != 0, "EasyBet: Activity does not exist");
        require(!activity.resolved, "EasyBet: Activity already resolved");
        require(
            block.timestamp < activity.endTime,
            "EasyBet: Betting period is over"
        );
        require(
            _choiceIndex < activity.choices.length,
            "EasyBet: Invalid choice"
        );
        require(_amount > 0, "EasyBet: Amount must be positive");

        // Transfer bet amount from player
        bool success = betToken.transferFrom(
            msg.sender,
            address(this),
            _amount
        );
        require(success, "EasyBet: Bet token transfer failed");

        // Update activity state
        activity.totalPool = activity.totalPool.add(_amount);
        activity.totalAmountBetOnChoice[_choiceIndex] = activity
            .totalAmountBetOnChoice[_choiceIndex]
            .add(_amount);

        // Mint ERC721 ticket
        uint256 tokenId = betTicket.mintTicket(
            msg.sender,
            _activityId,
            _choiceIndex,
            _amount
        );

        emit BetPlaced(
            _activityId,
            msg.sender,
            _choiceIndex,
            _amount,
            tokenId
        );
    }

    /**
     * @dev Claims winnings for a specific ticket.
     * The ticket must be for a resolved, winning choice.
     * The ticket (ERC721) is burned upon claiming.
     */
    function claimWinnings(uint256 _tokenId) external {
        // Check ticket ownership
        require(
            betTicket.ownerOf(_tokenId) == msg.sender,
            "EasyBet: Not owner of ticket"
        );

        // 修正 (v4): public getter for struct returns components
        (uint256 activityId, uint256 choiceIndex, uint256 amount) = betTicket.ticketInfo(_tokenId);
        
        Activity storage activity = activities[activityId];

        require(activity.resolved, "EasyBet: Activity not yet resolved");
        require(
            choiceIndex == activity.winningChoice,
            "EasyBet: Not a winning ticket"
        );

        uint256 totalWinningBetAmount = activity.totalAmountBetOnChoice[
            activity.winningChoice
        ];
        
        // This should not be claimable if totalWinningBetAmount is 0
        require(totalWinningBetAmount > 0, "EasyBet: No winning bets on this option");

        // Calculate proportional winnings
        uint256 winnings = (amount.mul(activity.totalPool)).div(
            totalWinningBetAmount
        );

        require(winnings > 0, "EasyBet: No winnings to claim");

        // Burn the ticket (prevents double claim)
        betTicket.burn(_tokenId);

        // Transfer winnings
        bool success = betToken.transfer(msg.sender, winnings);
        require(success, "EasyBet: Winnings transfer failed");

        emit WinningsClaimed(_tokenId, msg.sender, winnings);
    }

    // --- Ticket Marketplace Functions [Bonus 2] ---

    /**
     * @dev Lists an ERC721 ticket for sale.
     * The sender must first approve this contract to spend their ERC721.
     */
    function listTicket(uint256 _tokenId, uint256 _price) external {
        require(
            betTicket.ownerOf(_tokenId) == msg.sender,
            "EasyBet: Not owner"
        );
        require(
            betTicket.getApproved(_tokenId) == address(this),
            "EasyBet: Contract not approved to transfer this ticket"
        );

        // 修正 (v4): public getter for struct returns components
        // We only need activityId, so we can ignore the other return values.
        (uint256 activityId, , ) = betTicket.ticketInfo(_tokenId);
        
        require(
            !activities[activityId].resolved,
            "EasyBet: Cannot sell ticket for resolved activity"
        );
        require(_price > 0, "EasyBet: Price must be positive");

        sellOrders[_tokenId] = SellOrder(_tokenId, msg.sender, _price);

        emit TicketListed(_tokenId, msg.sender, _price);
    }

    /**
     * @dev Cancels a ticket listing.
     */
    function unlistTicket(uint256 _tokenId) external {
        SellOrder memory order = sellOrders[_tokenId];
        require(order.seller == msg.sender, "EasyBet: Not lister");

        delete sellOrders[_tokenId];
        
        // It's good practice to remove approval if no longer listed
        if (betTicket.getApproved(_tokenId) == address(this)) {
            betTicket.approve(address(0), _tokenId);
        }

        emit TicketUnlisted(_tokenId);
    }

    /**
     * @dev Buys a ticket listed on the marketplace.
     */
    function buyTicket(uint256 _tokenId) external {
        SellOrder memory order = sellOrders[_tokenId];
        require(order.seller != address(0), "EasyBet: Ticket not for sale");
        require(order.seller != msg.sender, "EasyBet: Cannot buy your own ticket");

        // 修正 (v4): public getter for struct returns components
        (uint256 activityId, , ) = betTicket.ticketInfo(_tokenId);

        require(
            !activities[activityId].resolved,
            "EasyBet: Cannot buy ticket for resolved activity"
        );

        // 1. Transfer payment (BetToken) from buyer to seller
        bool paymentSuccess = betToken.transferFrom(
            msg.sender,
            order.seller,
            order.price
        );
        require(paymentSuccess, "EasyBet: Payment transfer failed");

        // 2. Transfer ERC721 ticket from seller to buyer (via this contract)
        betTicket.transferFrom(order.seller, msg.sender, _tokenId);

        // 3. Delete the order
        delete sellOrders[_tokenId];

        emit TicketSold(_tokenId, order.seller, msg.sender, order.price);
    }
}