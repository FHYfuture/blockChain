// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "./BetToken.sol";
import "./BetTicket.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "hardhat/console.sol";

contract EasyBet {
    using SafeMath for uint256;

    address public immutable notary;
    BetToken public immutable betToken;
    BetTicket public immutable betTicket;

    // 修正 1: 改为 public，以便前端可以读取
    uint256 public _activityCounter;

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

    struct SellOrder {
        uint256 tokenId;
        address seller;
        uint256 price;
    }

    // 修正 2: 改为 private，因为 public getter 无法工作
    mapping(uint256 => Activity) private activities;
    
    mapping(uint256 => SellOrder) public sellOrders;

    // --- 修正 3: 新增 Getter 函数 ---
    
    /**
     * @dev 获取活动的核心信息 (不包括 mapping)
     */
    function getActivity(uint256 _activityId)
        public
        view
        returns (
            uint256 id,
            string memory description,
            string[] memory choices,
            uint256 endTime,
            uint256 totalPool,
            bool resolved,
            uint256 winningChoice
        )
    {
        Activity storage activity = activities[_activityId];
        return (
            activity.id,
            activity.description,
            activity.choices,
            activity.endTime,
            activity.totalPool,
            activity.resolved,
            activity.winningChoice
        );
    }

    /**
     * @dev 获取特定选项的总下注额
     */
    function getChoiceBetAmount(uint256 _activityId, uint256 _choiceIndex)
        public
        view
        returns (uint256)
    {
        return activities[_activityId].totalAmountBetOnChoice[_choiceIndex];
    }
    
    // --- (其他函数保持不变) ---

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

    constructor(address _betTokenAddress, address _betTicketAddress) {
        notary = msg.sender;
        betToken = BetToken(_betTokenAddress);
        betTicket = BetTicket(_betTicketAddress);
    }

    modifier onlyNotary() {
        require(msg.sender == notary, "EasyBet: Only notary can call this");
        _;
    }

    function createActivity(
        string calldata _description,
        string[] calldata _choices,
        uint256 _endTime,
        uint256 _initialPoolAmount
    ) external onlyNotary {
        require(_choices.length >= 2, "EasyBet: Must have at least 2 choices");
        require(_endTime > block.timestamp, "EasyBet: End time must be in the future");

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

        bool success = betToken.transferFrom(
            msg.sender,
            address(this),
            _amount
        );
        require(success, "EasyBet: Bet token transfer failed");

        activity.totalPool = activity.totalPool.add(_amount);
        activity.totalAmountBetOnChoice[_choiceIndex] = activity
            .totalAmountBetOnChoice[_choiceIndex]
            .add(_amount);

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

    function claimWinnings(uint256 _tokenId) external {
        require(
            betTicket.ownerOf(_tokenId) == msg.sender,
            "EasyBet: Not owner of ticket"
        );

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
        
        require(totalWinningBetAmount > 0, "EasyBet: No winning bets on this option");

        uint256 winnings = (amount.mul(activity.totalPool)).div(
            totalWinningBetAmount
        );

        require(winnings > 0, "EasyBet: No winnings to claim");

        betTicket.burn(_tokenId);

        bool success = betToken.transfer(msg.sender, winnings);
        require(success, "EasyBet: Winnings transfer failed");

        emit WinningsClaimed(_tokenId, msg.sender, winnings);
    }

    function listTicket(uint256 _tokenId, uint256 _price) external {
        require(
            betTicket.ownerOf(_tokenId) == msg.sender,
            "EasyBet: Not owner"
        );
        require(
            betTicket.getApproved(_tokenId) == address(this),
            "EasyBet: Contract not approved to transfer this ticket"
        );

        (uint256 activityId, , ) = betTicket.ticketInfo(_tokenId);
        
        require(
            !activities[activityId].resolved,
            "EasyBet: Cannot sell ticket for resolved activity"
        );
        require(_price > 0, "EasyBet: Price must be positive");

        sellOrders[_tokenId] = SellOrder(_tokenId, msg.sender, _price);

        emit TicketListed(_tokenId, msg.sender, _price);
    }

    function unlistTicket(uint256 _tokenId) external {
        SellOrder memory order = sellOrders[_tokenId];
        require(order.seller == msg.sender, "EasyBet: Not lister");

        delete sellOrders[_tokenId];
        
        if (betTicket.getApproved(_tokenId) == address(this)) {
            betTicket.approve(address(0), _tokenId);
        }

        emit TicketUnlisted(_tokenId);
    }

    function buyTicket(uint256 _tokenId) external {
        SellOrder memory order = sellOrders[_tokenId];
        require(order.seller != address(0), "EasyBet: Ticket not for sale");
        require(order.seller != msg.sender, "EasyBet: Cannot buy your own ticket");

        (uint256 activityId, , ) = betTicket.ticketInfo(_tokenId);

        require(
            !activities[activityId].resolved,
            "EasyBet: Cannot buy ticket for resolved activity"
        );

        bool paymentSuccess = betToken.transferFrom(
            msg.sender,
            order.seller,
            order.price
        );
        require(paymentSuccess, "EasyBet: Payment transfer failed");

        betTicket.transferFrom(order.seller, msg.sender, _tokenId);

        delete sellOrders[_tokenId];

        emit TicketSold(_tokenId, order.seller, msg.sender, order.price);
    }
}