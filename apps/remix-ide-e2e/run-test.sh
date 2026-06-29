#!/bin/bash

# Script to run E2E tests with flexible parameters
# Usage: 
#   yarn test:e2e --test=importResolver_group7        # Run specific group
#   yarn test:e2e --test=importResolver --group=group7  # Same as above
#   yarn test:e2e --test=importResolver               # Run all groups for importResolver
#   yarn test:e2e --test=ballot_group1 --env=firefox

TEST_NAME=""
GROUP_NAME=""
ENV_NAME="chrome"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --test=*)
            TEST_NAME="${1#*=}"
            shift
            ;;
        --group=*)
            GROUP_NAME="${1#*=}"
            shift
            ;;
        --env=*)
            ENV_NAME="${1#*=}"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

if [ -z "$TEST_NAME" ]; then
    echo "Error: Please provide --test parameter"
    echo "Usage examples:"
    echo "  yarn test:e2e --test=importResolver_group7        # Run specific group"
    echo "  yarn test:e2e --test=importResolver --group=group7  # Same as above"
    echo "  yarn test:e2e --test=importResolver               # Run all groups"
    echo "  yarn test:e2e --test=ballot_group1 --env=firefox"
    exit 1
fi

# Build E2E tests
echo "Building E2E tests..."
yarn build:e2e

# If both test and group are provided, combine them
if [ -n "$GROUP_NAME" ]; then
    # Check if test already contains group name
    if [[ "$TEST_NAME" == *"_group"* ]]; then
        FULL_TEST_NAME="$TEST_NAME"
    else
        FULL_TEST_NAME="${TEST_NAME}_${GROUP_NAME}"
    fi
    
    # Run single test
    echo "Running test: ${FULL_TEST_NAME} on environment: ${ENV_NAME}"
    nightwatch --config dist/apps/remix-ide-e2e/nightwatch-chrome.js \
        dist/apps/remix-ide-e2e/src/tests/${FULL_TEST_NAME}.test.js \
        --env=${ENV_NAME}
elif [[ "$TEST_NAME" == *"_group"* ]]; then
    # Test name already contains group, run single test
    echo "Running test: ${TEST_NAME} on environment: ${ENV_NAME}"
    nightwatch --config dist/apps/remix-ide-e2e/nightwatch-chrome.js \
        dist/apps/remix-ide-e2e/src/tests/${TEST_NAME}.test.js \
        --env=${ENV_NAME}
else
    # No group specified, check if group tests exist and run all of them
    GROUP_TESTS=$(ls dist/apps/remix-ide-e2e/src/tests/${TEST_NAME}_group*.test.js 2>/dev/null)
    
    if [ -n "$GROUP_TESTS" ]; then
        echo "Found group tests for ${TEST_NAME}, running all groups on environment: ${ENV_NAME}"
        echo "$GROUP_TESTS" | while read -r test_file; do
            test_basename=$(basename "$test_file" .test.js)
            echo ""
            echo "═══════════════════════════════════════════════════════════════"
            echo "Running: ${test_basename}"
            echo "═══════════════════════════════════════════════════════════════"
            nightwatch --config dist/apps/remix-ide-e2e/nightwatch-chrome.js \
                "$test_file" \
                --env=${ENV_NAME}
            
            TEST_EXIT_CODE=$?
            if [ $TEST_EXIT_CODE -ne 0 ]; then
                echo "❌ Test ${test_basename} failed with exit code ${TEST_EXIT_CODE}"
                exit $TEST_EXIT_CODE
            fi
            echo "✅ Test ${test_basename} passed"
        done
    else
        # No group tests found, try to run as single test
        echo "No group tests found, running single test: ${TEST_NAME} on environment: ${ENV_NAME}"
        nightwatch --config dist/apps/remix-ide-e2e/nightwatch-chrome.js \
            dist/apps/remix-ide-e2e/src/tests/${TEST_NAME}.test.js \
            --env=${ENV_NAME}
    fi
fi
