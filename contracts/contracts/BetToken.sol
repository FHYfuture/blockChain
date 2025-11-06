// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// [Bonus 1] ERC20 Token for betting
contract BetToken is ERC20, Ownable {
    // 修正: OpenZeppelin v4.x 的 Ownable() 构造函数没有参数
    constructor() ERC20("BetToken", "BET") Ownable() {}

    /**
     * @dev Public faucet function to get 1000 BET tokens for testing.
     * In a real application, this would be restricted or removed.
     */
    function faucet() external {
        _mint(msg.sender, 1000 * 10**decimals());
    }
}