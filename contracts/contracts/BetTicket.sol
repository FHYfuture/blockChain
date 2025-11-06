// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol"; 

/**
 * @title BetTicket
 * @dev 兼容 OpenZeppelin v4.x 和 Solidity 0.8.x
 */
contract BetTicket is ERC721, ERC721Enumerable, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    // Info stored for each ticket
    struct BetInfo {
        uint256 activityId;  // Which bet is this for?
        uint256 choiceIndex; // Which choice was selected?
        uint256 amount;      // How much was bet?
    }

    // Mapping from tokenId to the bet details
    mapping(uint256 => BetInfo) public ticketInfo;

    // 修正 1: OpenZeppelin v4 的 Ownable() 构造函数没有参数
    constructor() ERC721("EasyBet Ticket", "EBT") Ownable() {}

    /**
     * @dev Mints a new bet ticket. Only the owner (EasyBet contract) can call this.
     */
    function mintTicket(
        address player,
        uint256 activityId,
        uint256 choiceIndex,
        uint256 amount
    ) external onlyOwner returns (uint256) {
        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();
        _safeMint(player, tokenId);

        // Store the bet info
        ticketInfo[tokenId] = BetInfo(activityId, choiceIndex, amount);
        return tokenId;
    }

    /**
     * @dev Burns a ticket. Only the owner (EasyBet contract) can call this.
     * This is used when winnings are claimed.
     */
    function burn(uint256 tokenId) external onlyOwner {
        _burn(tokenId);
        delete ticketInfo[tokenId];
    }

    // 修正 2: 解决 "must override function _beforeTokenTransfer" 错误
    // 这是 v4 + Solidity 0.8 必需的
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    // 修正 3: 正确地 override supportsInterface
    // 删除了 v5 语法的 _update 和 _increaseBalance
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}