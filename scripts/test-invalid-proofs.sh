#!/bin/bash

# Test invalid proof rejection
set -e

echo "=== Testing Invalid Proof Rejection ==="
echo ""

# Check if API server is running
echo "Checking API server..."
if ! curl -k -s https://localhost:3000/health > /dev/null 2>&1; then
  echo "❌ API server is not running"
  echo "   Please start it with: pnpm start:dev"
  exit 1
fi
echo "✓ API server is running"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to test a request
test_request() {
  local test_name="$1"
  local request_json="$2"
  local should_fail="$3"

  echo "Test: $test_name"

  RESPONSE=$(echo "$request_json" | curl -k -s -X POST https://localhost:3000/zk-api/request \
    -H "Content-Type: application/json" \
    -d @- 2>&1 || echo '{"error": "request_failed"}')

  if echo "$RESPONSE" | jq -e '.response' > /dev/null 2>&1; then
    # Request succeeded
    if [ "$should_fail" = "true" ]; then
      echo "  ❌ FAIL: Request succeeded (expected to fail)"
      echo "  Response: $(echo "$RESPONSE" | jq -c '.' | head -c 100)"
      TESTS_FAILED=$((TESTS_FAILED + 1))
    else
      echo "  ✅ PASS: Request succeeded (as expected)"
      TESTS_PASSED=$((TESTS_PASSED + 1))
    fi
  else
    # Request failed
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.message // .error // "unknown_error"')
    if [ "$should_fail" = "true" ]; then
      echo "  ✅ PASS: Request rejected (as expected)"
      echo "  Error: $ERROR_MSG"
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      echo "  ❌ FAIL: Request rejected (expected to succeed)"
      echo "  Error: $ERROR_MSG"
      TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
  fi
  echo ""
}

# Valid proof structure for reference
VALID_PROOF='{"pi_a":["1","2","1"],"pi_b":[["1","2"],["1","2"],["1","1"]],"pi_c":["1","2","1"],"protocol":"groth16","curve":"bn128"}'

# Test 1: Malformed JSON proof
echo "=== Category 1: Malformed Proof Structure ==="
echo ""

test_request \
  "1.1 - Invalid JSON in proof field" \
  '{"payload":"test","nullifier":"0x1234567890123456789012345678901234567890123456789012345678901234","signal":{"x":"123","y":"456"},"proof":"{invalid json","maxCost":"100000000000000000"}' \
  "true"

test_request \
  "1.2 - Empty proof field" \
  '{"payload":"test","nullifier":"0x1234567890123456789012345678901234567890123456789012345678901234","signal":{"x":"123","y":"456"},"proof":"","maxCost":"100000000000000000"}' \
  "true"

test_request \
  "1.3 - Missing proof field" \
  '{"payload":"test","nullifier":"0x1234567890123456789012345678901234567890123456789012345678901234","signal":{"x":"123","y":"456"},"maxCost":"100000000000000000"}' \
  "true"

test_request \
  "1.4 - Proof as object instead of string" \
  "{\"payload\":\"test\",\"nullifier\":\"0x1234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$VALID_PROOF,\"maxCost\":\"100000000000000000\"}" \
  "true"

# Test 2: Invalid Groth16 proof structure
echo "=== Category 2: Invalid Groth16 Structure ==="
echo ""

INVALID_PROOF_MISSING_FIELD=$(echo "$VALID_PROOF" | jq 'del(.pi_a)' | jq -R)
test_request \
  "2.1 - Missing pi_a field" \
  "{\"payload\":\"test\",\"nullifier\":\"0x2234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$INVALID_PROOF_MISSING_FIELD,\"maxCost\":\"100000000000000000\"}" \
  "true"

INVALID_PROOF_WRONG_LENGTH=$(echo "$VALID_PROOF" | jq '.pi_a = ["1","2"]' | jq -R)
test_request \
  "2.2 - Wrong pi_a length (2 instead of 3)" \
  "{\"payload\":\"test\",\"nullifier\":\"0x3234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$INVALID_PROOF_WRONG_LENGTH,\"maxCost\":\"100000000000000000\"}" \
  "true"

INVALID_PROOF_WRONG_PROTOCOL=$(echo "$VALID_PROOF" | jq '.protocol = "invalid"' | jq -R)
test_request \
  "2.3 - Invalid protocol field" \
  "{\"payload\":\"test\",\"nullifier\":\"0x4234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$INVALID_PROOF_WRONG_PROTOCOL,\"maxCost\":\"100000000000000000\"}" \
  "true"

INVALID_PROOF_WRONG_CURVE=$(echo "$VALID_PROOF" | jq '.curve = "secp256k1"' | jq -R)
test_request \
  "2.4 - Invalid curve field" \
  "{\"payload\":\"test\",\"nullifier\":\"0x5234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$INVALID_PROOF_WRONG_CURVE,\"maxCost\":\"100000000000000000\"}" \
  "true"

# Test 3: Invalid nullifier format
echo "=== Category 3: Invalid Nullifier Format ==="
echo ""

test_request \
  "3.1 - Nullifier too short" \
  "{\"payload\":\"test\",\"nullifier\":\"0x1234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "3.2 - Nullifier too long" \
  "{\"payload\":\"test\",\"nullifier\":\"0x12345678901234567890123456789012345678901234567890123456789012345678901234567890\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "3.3 - Nullifier without 0x prefix" \
  "{\"payload\":\"test\",\"nullifier\":\"1234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "3.4 - Nullifier with invalid characters" \
  "{\"payload\":\"test\",\"nullifier\":\"0xGGGG567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "3.5 - Missing nullifier" \
  "{\"payload\":\"test\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

# Test 4: Invalid signal format
echo "=== Category 4: Invalid Signal Format ==="
echo ""

test_request \
  "4.1 - Missing signal.x" \
  "{\"payload\":\"test\",\"nullifier\":\"0x6234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "4.2 - Missing signal.y" \
  "{\"payload\":\"test\",\"nullifier\":\"0x7234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "4.3 - Missing signal object" \
  "{\"payload\":\"test\",\"nullifier\":\"0x8234567890123456789012345678901234567890123456789012345678901234\",\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "4.4 - Signal.x as string instead of number" \
  "{\"payload\":\"test\",\"nullifier\":\"0x9234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"not_a_number\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "4.5 - Negative signal values" \
  "{\"payload\":\"test\",\"nullifier\":\"0xa234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"-123\",\"y\":\"-456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

# Test 5: Invalid cost values
echo "=== Category 5: Invalid Cost Values ==="
echo ""

test_request \
  "5.1 - Negative maxCost" \
  "{\"payload\":\"test\",\"nullifier\":\"0xb234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"-100000000000000000\"}" \
  "true"

test_request \
  "5.2 - Zero maxCost" \
  "{\"payload\":\"test\",\"nullifier\":\"0xc234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"0\"}" \
  "true"

test_request \
  "5.3 - Missing maxCost" \
  "{\"payload\":\"test\",\"nullifier\":\"0xd234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R)}" \
  "true"

test_request \
  "5.4 - maxCost as string with invalid format" \
  "{\"payload\":\"test\",\"nullifier\":\"0xe234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"not_a_number\"}" \
  "true"

# Test 6: Invalid payload
echo "=== Category 6: Invalid Payload ==="
echo ""

test_request \
  "6.1 - Empty payload" \
  "{\"payload\":\"\",\"nullifier\":\"0xf234567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "6.2 - Missing payload" \
  "{\"nullifier\":\"0xf334567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

test_request \
  "6.3 - Payload as number instead of string" \
  "{\"payload\":12345,\"nullifier\":\"0xf434567890123456789012345678901234567890123456789012345678901234\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":$(echo "$VALID_PROOF" | jq -R),\"maxCost\":\"100000000000000000\"}" \
  "true"

# Test 7: Completely malformed requests
echo "=== Category 7: Malformed Requests ==="
echo ""

test_request \
  "7.1 - Empty JSON object" \
  "{}" \
  "true"

test_request \
  "7.2 - Invalid JSON" \
  "{invalid json}" \
  "true"

test_request \
  "7.3 - Array instead of object" \
  "[]" \
  "true"

# Summary
echo "=== Test Results Summary ==="
echo ""
TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
echo "Total tests: $TOTAL_TESTS"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "✅ ALL TESTS PASSED!"
  echo ""
  echo "The API correctly rejects all types of invalid proofs:"
  echo "  ✓ Malformed proof structures"
  echo "  ✓ Invalid Groth16 formats"
  echo "  ✓ Invalid nullifier formats"
  echo "  ✓ Invalid signal values"
  echo "  ✓ Invalid cost values"
  echo "  ✓ Invalid payloads"
  echo "  ✓ Malformed requests"
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  echo ""
  echo "The API is not properly validating all invalid proof types."
  echo "This could be a security vulnerability."
  exit 1
fi
