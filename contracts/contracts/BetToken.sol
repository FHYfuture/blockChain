// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// [Bonus 1] ERC20 Token for betting
contract BetToken is ERC20, Ownable {
    constructor() ERC20("BetToken", "BET") Ownable() {}
    function faucet() external {
        _mint(msg.sender, 1000 * 10**decimals());
    }
}