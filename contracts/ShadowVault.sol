// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ── INTERFACES ────────────────────────────────────────────────────────────────

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IERC721 {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params)
        external returns (uint256 amountOut);
}

interface INonfungiblePositionManager is IERC721 {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );

    function decreaseLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint256 amount0, uint256 amount1);

    function collect(
        uint256 tokenId,
        address recipient,
        uint128 amount0Max,
        uint128 amount1Max
    ) external returns (uint256 amount0, uint256 amount1);

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96  nonce,
            address operator,
            address token0,
            address token1,
            uint24  fee,
            int24   tickLower,
            int24   tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function increaseLiquidity(
        uint256 tokenId,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1);
}

// ── USER VAULT ────────────────────────────────────────────────────────────────

contract UserVault {

    uint256 public constant MAX_SLIPPAGE_BPS = 100;

    enum RecoveryPreference {
        SMART_REDEPLOY,
        RETURN_TO_POOL,
        RETURN_TO_WALLET
    }

    struct ReflexProof {
        uint256 threatDetectedAt;
        uint256 txConfirmedAt;
        uint256 reactionTime;
        uint256 reactionBlocks;
        uint256 token0Secured;
        uint256 token1Secured;
        bytes32 proofHash;
    }

    // ── STATE ─────────────────────────────────────────────────────────────────
    address public immutable owner;
    address public immutable factory;
    address public authorizedAgent;
    address public immutable positionManager;
    address public immutable swapRouter;

    uint256 public lpTokenId;
    bool    public positionRegistered;
    bool    public fundsInVault;
    bool    public bunkerMode;

    address public savedToken0;
    address public savedToken1;
    uint24  public savedFee;
    int24   public savedTickLower;
    int24   public savedTickUpper;

    address public safePoolToken0;
    address public safePoolToken1;
    uint24  public safePoolFee;
    int24   public safePoolTickLower;
    int24   public safePoolTickUpper;
    uint256 public redeployedTokenId;
    bool    public isRedeployed;

    uint256 public threatDetectedAt;
    uint256 public threatDetectedBlock;

    ReflexProof[] public reflexProofs;
    RecoveryPreference public recoveryPreference;

    string  public lastThreatType;
    string  public lastActionReason;
    uint256 public executionCount;
    bool    public autoModeEnabled;
    uint256 public lastReactionTime;

    // ── EVENTS ────────────────────────────────────────────────────────────────
    event PositionRegistered(uint256 indexed tokenId);
    event PositionReset(address indexed user);

    event ThreatDetected(
        uint256 indexed reflexId,
        uint256 threatTimestamp,
        uint256 threatBlock,
        uint256 vibeScore,
        string  threatType
    );

    event GhostMoveExecuted(
        address indexed vault,
        string  action,
        string  threatType,
        uint256 reactionTime,
        uint256 blockNumber,
        uint256 token0Secured,
        uint256 token1Secured,
        bytes32 proofHash
    );

    event BunkerModeActivated();
    event BunkerModeDeactivated();
    event FundsRedeployedToSaferPool(uint256 newTokenId, address token0, address token1);
    event FundsReturnedToOriginalPool(uint256 tokenId);
    event FundsReturnedToWallet(uint256 token0Amount, uint256 token1Amount);
    event PreferenceUpdated(RecoveryPreference preference);
    event SafePoolUpdated(address token0, address token1, uint24 fee);
    event AgentUpdated(address indexed newAgent);
    event AutoModeUpdated(bool enabled);
    event SafeVaultFallback(uint256 token0Amount, uint256 token1Amount);

    // ── MODIFIERS ─────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(
            msg.sender == owner || msg.sender == authorizedAgent,
            "Unauthorized"
        );
        _;
    }

    modifier notInBunkerOrAgent() {
        require(
            !bunkerMode || msg.sender == authorizedAgent,
            "Bunker locked"
        );
        _;
    }

    modifier notInBunker() {
        require(!bunkerMode, "Vault in bunker mode");
        _;
    }

    modifier autoModeOn() {
        require(autoModeEnabled, "Auto mode disabled");
        _;
    }

    // ── CONSTRUCTOR ───────────────────────────────────────────────────────────
    constructor(
        address _owner,
        address _agent,
        address _positionManager,
        address _swapRouter,
        RecoveryPreference _preference
    ) {
        owner              = _owner;
        factory            = msg.sender;
        authorizedAgent    = _agent;
        positionManager    = _positionManager;
        swapRouter         = _swapRouter;
        recoveryPreference = _preference;
        autoModeEnabled    = true;
    }

    receive() external payable {}

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ── REGISTER LP POSITION ─────────────────────────────────────────────────
    function registerPosition(uint256 tokenId) external onlyOwner {
        require(!positionRegistered, "Position already registered");

        INonfungiblePositionManager pm =
            INonfungiblePositionManager(positionManager);

        pm.safeTransferFrom(msg.sender, address(this), tokenId);

        (
            , , address token0, address token1,
            uint24 fee, int24 tickLower, int24 tickUpper,
            , , , ,
        ) = pm.positions(tokenId);

        lpTokenId          = tokenId;
        savedToken0        = token0;
        savedToken1        = token1;
        savedFee           = fee;
        savedTickLower     = tickLower;
        savedTickUpper     = tickUpper;
        positionRegistered = true;

        emit PositionRegistered(tokenId);
    }

    // ── LOG THREAT ────────────────────────────────────────────────────────────
    function logThreat(uint256 vibeScore, string calldata threatType) external onlyAuthorized autoModeOn {
        require(positionRegistered, "No position registered");
        require(!fundsInVault, "Already exited");

        threatDetectedAt    = block.timestamp;
        threatDetectedBlock = block.number;
        lastThreatType      = threatType;

        uint256 reflexId = reflexProofs.length;

        emit ThreatDetected(reflexId, block.timestamp, block.number, vibeScore, threatType);
    }

    // ── GHOST MOVE ────────────────────────────────────────────────────────────
    function emergencyExit() external onlyAuthorized autoModeOn {
        require(positionRegistered, "No position registered");
        require(!fundsInVault, "Funds already in vault");
        require(threatDetectedAt > 0, "Must call logThreat first");

        INonfungiblePositionManager pm =
            INonfungiblePositionManager(positionManager);

        (, , , , , , , uint128 liquidity, , , , ) = pm.positions(lpTokenId);
        require(liquidity > 0, "No liquidity to withdraw");

        pm.decreaseLiquidity(
            lpTokenId, liquidity, 0, 0, block.timestamp + 300
        );

        pm.collect(
            lpTokenId, address(this),
            type(uint128).max, type(uint128).max
        );

        fundsInVault     = true;
        bunkerMode       = true;
        executionCount++;
        lastActionReason = "Emergency exit triggered";

        emit BunkerModeActivated();

        uint256 bal0 = IERC20(savedToken0).balanceOf(address(this));
        uint256 bal1 = IERC20(savedToken1).balanceOf(address(this));

        uint256 reactionBlocks = block.number - threatDetectedBlock;
        uint256 reactionTime   = block.timestamp - threatDetectedAt;
        lastReactionTime       = reactionTime;

        bytes32 proofHash = keccak256(abi.encodePacked(
            threatDetectedAt,
            block.timestamp,
            reactionTime,
            reactionBlocks,
            bal0,
            bal1,
            owner
        ));

        reflexProofs.push(ReflexProof({
            threatDetectedAt: threatDetectedAt,
            txConfirmedAt:    block.timestamp,
            reactionTime:     reactionTime,
            reactionBlocks:   reactionBlocks,
            token0Secured:    bal0,
            token1Secured:    bal1,
            proofHash:        proofHash
        }));

        emit GhostMoveExecuted(
            address(this),
            "emergencyExit",
            lastThreatType,
            reactionTime,
            block.number,
            bal0,
            bal1,
            proofHash
        );

        threatDetectedAt    = 0;
        threatDetectedBlock = 0;
    }

    // ── SET SAFE POOL ─────────────────────────────────────────────────────────
    function setSafePool(
        address _token0,
        address _token1,
        uint24  _fee,
        int24   _tickLower,
        int24   _tickUpper
    ) external onlyAuthorized {
        safePoolToken0    = _token0;
        safePoolToken1    = _token1;
        safePoolFee       = _fee;
        safePoolTickLower = _tickLower;
        safePoolTickUpper = _tickUpper;
        emit SafePoolUpdated(_token0, _token1, _fee);
    }

    // ── REDEPLOY TO SAFER POOL ────────────────────────────────────────────────
    function redeployToSaferPool() external onlyAuthorized notInBunkerOrAgent {
        require(fundsInVault, "No funds in vault");
        require(safePoolToken0 != address(0), "Safe pool not set");
        require(
            recoveryPreference == RecoveryPreference.SMART_REDEPLOY,
            "Preference not SMART_REDEPLOY"
        );

        INonfungiblePositionManager pm =
            INonfungiblePositionManager(positionManager);

        uint256 bal0 = IERC20(savedToken0).balanceOf(address(this));
        uint256 bal1 = IERC20(savedToken1).balanceOf(address(this));

        if (safePoolToken0 != savedToken0) {
            _swapForSafePool(bal0, bal1);
            bal0 = IERC20(safePoolToken0).balanceOf(address(this));
            bal1 = IERC20(safePoolToken1).balanceOf(address(this));
        }

        uint256 amount0Min = (bal0 * (10000 - MAX_SLIPPAGE_BPS)) / 10000;
        uint256 amount1Min = (bal1 * (10000 - MAX_SLIPPAGE_BPS)) / 10000;

        IERC20(safePoolToken0).approve(positionManager, bal0);
        IERC20(safePoolToken1).approve(positionManager, bal1);

        (uint256 newTokenId, , , ) = pm.mint(
            INonfungiblePositionManager.MintParams({
                token0:         safePoolToken0,
                token1:         safePoolToken1,
                fee:            safePoolFee,
                tickLower:      safePoolTickLower,
                tickUpper:      safePoolTickUpper,
                amount0Desired: bal0,
                amount1Desired: bal1,
                amount0Min:     amount0Min,
                amount1Min:     amount1Min,
                recipient:      address(this),
                deadline:       block.timestamp + 300
            })
        );

        redeployedTokenId = newTokenId;
        isRedeployed      = true;
        fundsInVault      = false;
        bunkerMode        = false;
        executionCount++;
        lastActionReason  = "Redeployed to safer pool";

        emit GhostMoveExecuted(
            address(this),
            "redeployToSaferPool",
            lastThreatType,
            lastReactionTime,
            block.number,
            bal0,
            bal1,
            bytes32(0)
        );

        emit FundsRedeployedToSaferPool(newTokenId, safePoolToken0, safePoolToken1);
    }

    // ── RETURN TO ORIGINAL POOL ───────────────────────────────────────────────
    function returnToOriginalPool() external onlyAuthorized notInBunkerOrAgent {
        require(fundsInVault, "No funds in vault");
        require(
            recoveryPreference == RecoveryPreference.RETURN_TO_POOL,
            "Preference not RETURN_TO_POOL"
        );

        INonfungiblePositionManager pm =
            INonfungiblePositionManager(positionManager);

        uint256 bal0 = IERC20(savedToken0).balanceOf(address(this));
        uint256 bal1 = IERC20(savedToken1).balanceOf(address(this));

        IERC20(savedToken0).approve(positionManager, bal0);
        IERC20(savedToken1).approve(positionManager, bal1);

        pm.increaseLiquidity(
            lpTokenId, bal0, bal1, 0, 0, block.timestamp + 300
        );

        fundsInVault     = false;
        bunkerMode       = false;
        executionCount++;
        lastActionReason = "Returned to original pool";

        emit FundsReturnedToOriginalPool(lpTokenId);
    }

    // ── RETURN TO WALLET ──────────────────────────────────────────────────────
    function returnToWallet() external onlyAuthorized notInBunkerOrAgent {
        require(fundsInVault, "No funds in vault");
        require(
            recoveryPreference == RecoveryPreference.RETURN_TO_WALLET,
            "Preference not RETURN_TO_WALLET"
        );

        uint256 bal0 = IERC20(savedToken0).balanceOf(address(this));
        uint256 bal1 = IERC20(savedToken1).balanceOf(address(this));

        if (bal0 > 0) IERC20(savedToken0).transfer(owner, bal0);
        if (bal1 > 0) IERC20(savedToken1).transfer(owner, bal1);

        if (address(this).balance > 0) {
            (bool ok, ) = owner.call{value: address(this).balance}("");
            require(ok, "XTZ return failed");
        }

        fundsInVault     = false;
        bunkerMode       = false;
        executionCount++;
        lastActionReason = "Funds returned to wallet";

        emit FundsReturnedToWallet(bal0, bal1);
    }

    // ── SAFE VAULT FALLBACK ───────────────────────────────────────────────────
    function moveToSafeVault() external onlyAuthorized {
        require(fundsInVault, "No funds in vault");

        uint256 bal0 = IERC20(savedToken0).balanceOf(address(this));
        uint256 bal1 = IERC20(savedToken1).balanceOf(address(this));

        if (bal0 > 0) IERC20(savedToken0).transfer(owner, bal0);
        if (bal1 > 0) IERC20(savedToken1).transfer(owner, bal1);

        if (address(this).balance > 0) {
            (bool ok, ) = owner.call{value: address(this).balance}("");
            require(ok, "XTZ return failed");
        }

        fundsInVault     = false;
        bunkerMode       = false;
        executionCount++;
        lastActionReason = "Redeploy failed - safe vault fallback";

        emit SafeVaultFallback(bal0, bal1);
    }

    // ── BUNKER MODE CONTROLS ──────────────────────────────────────────────────
    function deactivateBunker() external onlyOwner {
        require(bunkerMode, "Not in bunker mode");
        bunkerMode = false;
        emit BunkerModeDeactivated();
    }

    // ── AUTO MODE ─────────────────────────────────────────────────────────────
    function setAutoMode(bool _enabled) external onlyOwner {
        autoModeEnabled = _enabled;
        emit AutoModeUpdated(_enabled);
    }

    // ── INTERNAL SWAP ─────────────────────────────────────────────────────────
    function _swapForSafePool(uint256 bal0, uint256 bal1) internal {
        ISwapRouter router = ISwapRouter(swapRouter);

        uint256 out0Min = (bal0 * (10000 - MAX_SLIPPAGE_BPS)) / 10000;
        uint256 out1Min = (bal1 * (10000 - MAX_SLIPPAGE_BPS)) / 10000;

        if (bal0 > 0) {
            IERC20(savedToken0).approve(swapRouter, bal0);
            router.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn:           savedToken0,
                    tokenOut:          safePoolToken0,
                    fee:               safePoolFee,
                    recipient:         address(this),
                    deadline:          block.timestamp + 300,
                    amountIn:          bal0,
                    amountOutMinimum:  out0Min,
                    sqrtPriceLimitX96: 0
                })
            );
        }

        if (bal1 > 0) {
            IERC20(savedToken1).approve(swapRouter, bal1);
            router.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn:           savedToken1,
                    tokenOut:          safePoolToken1,
                    fee:               safePoolFee,
                    recipient:         address(this),
                    deadline:          block.timestamp + 300,
                    amountIn:          bal1,
                    amountOutMinimum:  out1Min,
                    sqrtPriceLimitX96: 0
                })
            );
        }
    }

    // ── OWNER SETTINGS ────────────────────────────────────────────────────────
    function setRecoveryPreference(RecoveryPreference _preference)
        external onlyOwner
    {
        recoveryPreference = _preference;
        emit PreferenceUpdated(_preference);
    }

    function setAgent(address _newAgent) external onlyOwner {
        authorizedAgent = _newAgent;
        emit AgentUpdated(_newAgent);
    }

    // ── RESET POSITION ────────────────────────────────────────────────────────
    function resetPosition() external onlyAuthorized {
        require(!fundsInVault, "Cannot reset while funds in vault");

        positionRegistered = false;
        fundsInVault       = false;
        lpTokenId          = 0;
        savedToken0        = address(0);
        savedToken1        = address(0);
        savedFee           = 0;
        savedTickLower     = 0;
        savedTickUpper     = 0;
        threatDetectedAt   = 0;
        threatDetectedBlock = 0;
        bunkerMode         = false;

        emit PositionReset(msg.sender);
    }

    // ── VIEW FUNCTIONS ────────────────────────────────────────────────────────
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function getPreference() external view returns (RecoveryPreference) {
        return recoveryPreference;
    }

    function getFundsState() external view returns (string memory) {
        if (fundsInVault && bunkerMode) return "SECURED";
        if (fundsInVault) return "IN_TRANSIT";
        return "IN_POOL";
    }

    function getLatestAction() external view returns (
        string memory threat,
        string memory reason,
        uint256 executions
    ) {
        return (lastThreatType, lastActionReason, executionCount);
    }

    function getReflexProof(uint256 index) external view returns (ReflexProof memory) {
        require(index < reflexProofs.length, "Index out of range");
        return reflexProofs[index];
    }

    function getReflexProofCount() external view returns (uint256) {
        return reflexProofs.length;
    }

    function getLatestReflexProof() external view returns (ReflexProof memory) {
        require(reflexProofs.length > 0, "No proofs yet");
        return reflexProofs[reflexProofs.length - 1];
    }
}

// ── FACTORY ───────────────────────────────────────────────────────────────────

contract ShadowVaultFactory {

    mapping(address => address) public userToVault;

    address public immutable positionManager;
    address public immutable swapRouter;

    event VaultCreated(address indexed user, address indexed vault);

    constructor(address _positionManager, address _swapRouter) {
        positionManager = _positionManager;
        swapRouter      = _swapRouter;
    }

    function createVault(
        address _agent,
        uint8   _preference
    ) external returns (address) {
        require(userToVault[msg.sender] == address(0), "Vault already exists");

        UserVault vault = new UserVault(
            msg.sender,
            _agent,
            positionManager,
            swapRouter,
            UserVault.RecoveryPreference(_preference)
        );

        userToVault[msg.sender] = address(vault);
        emit VaultCreated(msg.sender, address(vault));
        return address(vault);
    }

    function getVault(address user) external view returns (address) {
        return userToVault[user];
    }
}