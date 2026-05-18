export const SECURITY_ANALYSIS_PROMPT = `When analyzing smart contracts for security:

Focus on:
1. **Reentrancy**: Check for state changes after external calls
2. **Access Control**: Verify proper permission checks
3. **Integer Issues**: Look for potential overflow/underflow
4. **Gas Limits**: Identify unbounded loops
5. **External Calls**: Check for unchecked return values
6. **Delegatecall**: Verify safe usage
7. **Randomness**: Check for predictable randomness usage
8. **Front-running**: Identify vulnerable transaction ordering

Use the analyze_security tool to get detailed analysis, then explain findings clearly.`
