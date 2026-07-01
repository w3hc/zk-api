// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract WithdrawalVerifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 5410314826720580425284091460105803978102547819498560162120120173221536825521;
    uint256 constant alphay  = 3115412823091968495359535707414470610129456037991874181731617032057741628310;
    uint256 constant betax1  = 8431390769576450786677585831668781719210937357418316854662222963218305469819;
    uint256 constant betax2  = 18342269619118655087381185601807990979868033234887274929180955903829388529046;
    uint256 constant betay1  = 5524612894081665576817159059153622306483897218540582420076898916444602421941;
    uint256 constant betay2  = 11535991582272723548585725370788746212458962916361249832044945740841820847387;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 403602590719730086019882680176248457032121144205426486649280599231289723629;
    uint256 constant deltax2 = 911303834549557692149562472528239832528950460761698677222566368036397686532;
    uint256 constant deltay1 = 1898795264567017592313244641994752941529183755308788923042776294956612343966;
    uint256 constant deltay2 = 21553406707282461947357936430031093579330256641616952276194872928251622818899;

    
    uint256 constant IC0x = 12081698366779836697774547202117396692453088602613529841189273896003802040204;
    uint256 constant IC0y = 6523808890515462047812222821527381157727297539304698604988055586498579645918;
    
    uint256 constant IC1x = 17865369332508366254907715002669942239042574554730466554976123119902537700890;
    uint256 constant IC1y = 406494593559725056347716595279113449984388685930656990066794703076341359842;
    
    uint256 constant IC2x = 9842809761640033920245034441244786428729465184948305610599071712251383898610;
    uint256 constant IC2y = 13490899622204230768352768399796685838315632846041402849811388515926804948233;
    
    uint256 constant IC3x = 4212234324472042344469685561665345822474655593045832081666536228211433355700;
    uint256 constant IC3y = 6468341161241666391853883308229521278946749799933167153790844130406383512202;
    
    uint256 constant IC4x = 17661784935036534237920282922176361774149098960812733415644807553300760144182;
    uint256 constant IC4y = 8294508719462947554002244921471997350328031159283789700054293811998313244863;
    
    uint256 constant IC5x = 11854062879876131583780693254850153812418263734858197169780179721302020992647;
    uint256 constant IC5y = 6745941421237322010439889457855175299639361891575351056057927701134716035221;
    
    uint256 constant IC6x = 8990303543000639369236090795258281183280747428948330962047986031657049738238;
    uint256 constant IC6y = 16780792636357264826313787982052751922295876502026006807826993006829639778807;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[6] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }


    /// @notice Verify proof with simplified interface
    function verifyWithdrawalProof(uint256[8] calldata _proof, uint256[6] calldata _publicSignals) external view returns (bool) {
        uint256[2] memory pA;
        pA[0] = _proof[0];
        pA[1] = _proof[1];

        uint256[2][2] memory pB;
        pB[0][0] = _proof[2];
        pB[0][1] = _proof[3];
        pB[1][0] = _proof[4];
        pB[1][1] = _proof[5];

        uint256[2] memory pC;
        pC[0] = _proof[6];
        pC[1] = _proof[7];

        (bool success, bytes memory data) = address(this).staticcall(
            abi.encodeWithSelector(this.verifyProof.selector, pA, pB, pC, _publicSignals)
        );
        require(success);
        return abi.decode(data, (bool));
    }
}
