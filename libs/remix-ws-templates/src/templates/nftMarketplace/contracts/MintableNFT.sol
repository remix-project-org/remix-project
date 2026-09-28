// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MintableNFT
 * @dev An ERC-721 NFT collection with EIP-2981 royalty support.
 * Compatible with the NFTMarketplace contract in this template.
 */
contract MintableNFT is ERC721Enumerable, ERC721Royalty, Ownable {
    uint256 private _nextTokenId;
    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public mintPrice = 0.01 ether;
    string private _baseTokenURI;

    constructor(
        string memory name,
        string memory symbol,
        address royaltyRecipient,
        uint96 royaltyFeeBps // e.g. 500 = 5%
    ) ERC721(name, symbol) Ownable(msg.sender) {
        _setDefaultRoyalty(royaltyRecipient, royaltyFeeBps);
    }

    function mint(address to) external payable returns (uint256 tokenId) {
        require(msg.value >= mintPrice, "Insufficient payment");
        require(_nextTokenId < MAX_SUPPLY, "Max supply reached");
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
    }

    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
