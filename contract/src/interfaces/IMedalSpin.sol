// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

struct SpinInfo {
	bytes32 hash;
	uint256 timestamp;
}

interface IMedalSpin {
	/// @notice Revert if the spin is too soon
	error SpinTooSoon();

	/// @notice Revert if the hash has already been collected
	error HashAlreadyCollected();

	/// @notice Revert if the timestamps are invalid
	error InvalidTimestamps();

	/// @notice Emitted when a collector spins for a medal
	event Spin(address indexed collector, bytes32 hash, uint256 timestamp);

	/// @notice Returns the spins of a collector
	/// @param collector The collector to get spins for
	/// @return The spins of the collector
	function getSpins(address collector) external view returns (SpinInfo[] memory);

	/// @notice Returns the collector of a hash
	/// @param hash The hash to get the collector for
	/// @return The collector of the hash
	function getCollector(bytes32 hash) external view returns (address);

	/// @notice Returns whether a collector can spin
	/// @param collector The collector to check
	/// @return Whether the collector can spin
	function canSpin(address collector) external view returns (bool);

	/// @notice Allows a collector to spin for a medal
	/// @param hash The hash of the spin
	function spin(bytes32 hash) external;
}
