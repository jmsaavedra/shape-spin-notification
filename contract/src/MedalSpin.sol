// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IMedalSpin, SpinInfo} from "./interfaces/IMedalSpin.sol";

/**
 * @title MedalSpin
 * @author j6i
 * @notice MedalSpin allows medal collectors to spin for a medal
 */
contract MedalSpin is IMedalSpin {
	/// @notice The number of seconds in a day
	uint256 constant SECONDS_PER_DAY = 24 * 60 * 60;

	/// @notice Mapping of collector address to their spins
	mapping(address => SpinInfo[]) private _spins;

	/// @notice Mapping of hash to collector
	mapping(bytes32 => address) private _collector;

	constructor() {}

	/**
	 * @notice Returns the spins of a collector
	 * @param collector The collector to get spins for
	 * @return The spins of the collector
	 */
	function getSpins(address collector) external view returns (SpinInfo[] memory) {
		return _spins[collector];
	}

	/**
	 * @notice Returns the collector of a hash
	 * @param hash The hash to get the collector for
	 * @return The collector of the hash
	 */
	function getCollector(bytes32 hash) external view returns (address) {
		return _collector[hash];
	}

	/**
	 * @notice Returns whether a collector can spin
	 * @param collector The collector to check
	 * @return Whether the collector can spin
	 */
	function canSpin(address collector) external view returns (bool) {
		return _canSpin(collector);
	}

	/**
	 * @notice Allows a collector to spin for a medal
	 * @param hash The hash of the spin
	 */
	function spin(bytes32 hash) external {
		_checkValidSpin(msg.sender, hash);

		_spins[msg.sender].push(SpinInfo({hash: hash, timestamp: block.timestamp}));

		_collector[hash] = msg.sender;

		emit Spin(msg.sender, hash, block.timestamp);
	}

	/**
	 * @notice Revert if the spin is too soon
	 * @param collector The collector to check
	 * @param hash The hash of the spin
	 */
	function _checkValidSpin(address collector, bytes32 hash) internal view {
		if (_collector[hash] != address(0)) revert HashAlreadyCollected();
		if (!_canSpin(collector)) revert SpinTooSoon();
	}

	/**
	 * @notice Returns whether a collector can spin
	 * @param collector The collector to check
	 * @return Whether the collector can spin
	 */
	function _canSpin(address collector) internal view returns (bool) {
		if (_spins[collector].length == 0) {
			return true;
		}

		uint256 lastSpinTimestamp = _spins[collector][_spins[collector].length - 1].timestamp;

		uint256 minutesGap = _diffDays(lastSpinTimestamp, block.timestamp);

		if (minutesGap < 1) {
			return false;
		}

		return true;
	}

	/**
	 * @dev this function is taken from BokkyPooBahsDateTimeLibrary (https://github.com/bokkypoobah/BokkyPooBahsDateTimeLibrary/blob/master/contracts/BokkyPooBahsDateTimeLibrary.sol)
	 */
	function _diffDays(uint256 fromTimestamp, uint256 toTimestamp) internal pure returns (uint256 _days) {
		if (fromTimestamp > toTimestamp) revert InvalidTimestamps();

		_days = (toTimestamp - fromTimestamp) / SECONDS_PER_DAY;
	}
}
