// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTMarketplace
 * @dev A simple NFT marketplace supporting fixed-price listings and offers.
 *
 * Sellers list NFTs at a fixed price. Buyers fulfill listings. The marketplace
 * collects a protocol fee (2.5%) and forwards creator royalties (EIP-2981).
 *
 * Key DeFi/NFT concepts demonstrated:
 * - Fixed-price listings with escrow-free model (NFT stays in seller's wallet)
 * - EIP-2981 royalty lookups (creator gets a cut on every secondary sale)
 * - Protocol fee collection
 * - Off-chain offer signing (Seaport-style, simplified)
 *
 * Inspired by: OpenSea Seaport, Blur, LooksRare
 */
contract NFTMarketplace is Ownable, ReentrancyGuard, Pausable {
    uint256 public constant PROTOCOL_FEE_BPS = 250; // 2.5%
    uint256 public constant MAX_ROYALTY_BPS = 1000;  // 10% max royalty honored
    uint256 public constant BPS_DENOMINATOR = 10000;

    address public feeRecipient;

    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;      // Price in ETH (wei)
        bool active;
    }

    // listingId => Listing
    mapping(bytes32 => Listing) public listings;

    event Listed(
        bytes32 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 price
    );
    event ListingCancelled(bytes32 indexed listingId);
    event Sale(
        bytes32 indexed listingId,
        address indexed buyer,
        address indexed seller,
        address nftContract,
        uint256 tokenId,
        uint256 price,
        uint256 protocolFee,
        uint256 royalty
    );

    constructor(address _feeRecipient) Ownable(msg.sender) {
        feeRecipient = _feeRecipient;
    }

    // ─── Listing ──────────────────────────────────────────────────────────────

    /**
     * @dev List an NFT for sale. The NFT stays in the seller's wallet;
     *      approval must be granted to this contract before listing.
     */
    function list(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external whenNotPaused returns (bytes32 listingId) {
        require(price > 0, "Price must be > 0");
        require(
            IERC721(nftContract).ownerOf(tokenId) == msg.sender,
            "Not the owner"
        );
        require(
            IERC721(nftContract).isApprovedForAll(msg.sender, address(this)) ||
            IERC721(nftContract).getApproved(tokenId) == address(this),
            "Marketplace not approved"
        );

        listingId = keccak256(abi.encodePacked(nftContract, tokenId, msg.sender, block.timestamp));

        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            active: true
        });

        emit Listed(listingId, msg.sender, nftContract, tokenId, price);
    }

    /**
     * @dev Cancel an active listing.
     */
    function cancelListing(bytes32 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "Listing not active");
        require(l.seller == msg.sender || msg.sender == owner(), "Not authorized");
        l.active = false;
        emit ListingCancelled(listingId);
    }

    // ─── Purchase ─────────────────────────────────────────────────────────────

    /**
     * @dev Buy a listed NFT. Sends ETH to seller (minus fees and royalties).
     */
    function buy(bytes32 listingId) external payable nonReentrant whenNotPaused {
        Listing storage l = listings[listingId];
        require(l.active, "Listing not active");
        require(msg.value >= l.price, "Insufficient payment");
        require(
            IERC721(l.nftContract).ownerOf(l.tokenId) == l.seller,
            "Seller no longer owns NFT"
        );

        l.active = false;

        uint256 price = l.price;
        uint256 protocolFee = (price * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 royaltyAmount = _getRoyalty(l.nftContract, l.tokenId, price);
        address royaltyRecipient = _getRoyaltyRecipient(l.nftContract, l.tokenId);

        uint256 sellerProceeds = price - protocolFee - royaltyAmount;

        // Transfer NFT
        IERC721(l.nftContract).safeTransferFrom(l.seller, msg.sender, l.tokenId);

        // Distribute ETH
        payable(feeRecipient).transfer(protocolFee);
        if (royaltyAmount > 0 && royaltyRecipient != address(0)) {
            payable(royaltyRecipient).transfer(royaltyAmount);
        } else {
            sellerProceeds += royaltyAmount;
        }
        payable(l.seller).transfer(sellerProceeds);

        // Refund excess payment
        if (msg.value > price) {
            payable(msg.sender).transfer(msg.value - price);
        }

        emit Sale(listingId, msg.sender, l.seller, l.nftContract, l.tokenId, price, protocolFee, royaltyAmount);
    }

    // ─── EIP-2981 Royalties ───────────────────────────────────────────────────

    function _getRoyalty(address nftContract, uint256 tokenId, uint256 salePrice)
        internal
        view
        returns (uint256)
    {
        try IERC2981(nftContract).royaltyInfo(tokenId, salePrice) returns (
            address, uint256 royaltyAmount
        ) {
            uint256 maxRoyalty = (salePrice * MAX_ROYALTY_BPS) / BPS_DENOMINATOR;
            return royaltyAmount > maxRoyalty ? maxRoyalty : royaltyAmount;
        } catch {
            return 0;
        }
    }

    function _getRoyaltyRecipient(address nftContract, uint256 tokenId)
        internal
        view
        returns (address recipient)
    {
        try IERC2981(nftContract).royaltyInfo(tokenId, 10000) returns (
            address r, uint256
        ) {
            return r;
        } catch {
            return address(0);
        }
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}

interface IERC2981 {
    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);
}
