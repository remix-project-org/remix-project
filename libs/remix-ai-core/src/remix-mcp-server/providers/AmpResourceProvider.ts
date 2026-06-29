import { remixAILogger } from '../../helpers/logger'
/**
 * Amp Resource Provider - Provides access to Amp query examples and documentation
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';

export class AmpResourceProvider extends BaseResourceProvider {
  name = 'amp';
  description = 'Provides access to Amp query examples and documentation';
  private _plugin: Plugin;

  constructor(plugin: Plugin) {
    super();
    this._plugin = plugin;
  }

  async getResources(plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    try {
      // Add Amp query examples resource
      resources.push(
        this.createResource(
          'amp://examples',
          'Amp Query Examples',
          'Collection of example SQL queries for querying blockchain data using Amp',
          'application/json',
          {
            category: ResourceCategory.ANALYSIS,
            tags: ['amp', 'sql', 'blockchain', 'queries', 'examples'],
            priority: 8
          }
        )
      );

      // Add Amp documentation resource
      resources.push(
        this.createResource(
          'amp://documentation',
          'Amp Documentation',
          'Documentation and best practices for using Amp to query blockchain data',
          'text/markdown',
          {
            category: ResourceCategory.ANALYSIS,
            tags: ['amp', 'documentation', 'guide'],
            priority: 7
          }
        )
      );
    } catch (error) {
      remixAILogger.warn('Failed to get Amp resources:', error);
    }

    return resources;
  }

  async getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    if (uri === 'amp://examples') {
      return this.getAmpExamples();
    }

    if (uri === 'amp://documentation') {
      return this.getAmpDocumentation();
    }

    throw new Error(`Unsupported Amp resource URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('amp://');
  }

  private async getAmpExamples(): Promise<IMCPResourceContent> {
    const examples = {
      description: 'Collection of example SQL queries for querying blockchain data using Amp',
      examples: [
        {
          name: 'Get Recent Blocks',
          description: 'Retrieve the 100 most recent blocks from a dataset',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."blocks" ORDER BY _block_num DESC LIMIT 100;',
          category: 'Blocks',
          difficulty: 'Beginner'
        },
        {
          name: 'Get Block by Number',
          description: 'Retrieve a specific block by its block number',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."blocks" WHERE _block_num = 12345678;',
          category: 'Blocks',
          difficulty: 'Beginner'
        },
        {
          name: 'Get Blocks in Range',
          description: 'Retrieve blocks within a specific block number range',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."blocks" WHERE _block_num BETWEEN 12345000 AND 12346000 ORDER BY _block_num;',
          category: 'Blocks',
          difficulty: 'Beginner'
        },
        {
          name: 'Get Recent Transactions',
          description: 'Retrieve recent transactions from a dataset',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."transactions" ORDER BY _block_num DESC LIMIT 50;',
          category: 'Transactions',
          difficulty: 'Beginner'
        },
        {
          name: 'Filter by Address',
          description: 'Get transactions for a specific address',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."transactions" WHERE from_address = \'0x1234...\' OR to_address = \'0x1234...\' ORDER BY _block_num DESC LIMIT 100;',
          category: 'Transactions',
          difficulty: 'Intermediate'
        },
        {
          name: 'Aggregate Transaction Count',
          description: 'Count the number of transactions per block',
          query: 'SELECT _block_num, COUNT(*) as tx_count FROM "shiyasmohd/counter@0.0.2"."transactions" GROUP BY _block_num ORDER BY _block_num DESC LIMIT 100;',
          category: 'Aggregations',
          difficulty: 'Intermediate'
        },
        {
          name: 'Get Events',
          description: 'Retrieve contract events from a specific dataset',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."events" ORDER BY _block_num DESC LIMIT 100;',
          category: 'Events',
          difficulty: 'Beginner'
        },
        {
          name: 'Filter Events by Topic',
          description: 'Get events filtered by specific event signature (topic0)',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."events" WHERE topic0 = \'0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef\' ORDER BY _block_num DESC LIMIT 100;',
          category: 'Events',
          difficulty: 'Intermediate'
        },
        {
          name: 'Join Blocks and Transactions',
          description: 'Join blocks and transactions tables to get enriched data',
          query: 'SELECT b._block_num, b.timestamp, t.hash, t.from_address, t.to_address, t.value FROM "shiyasmohd/counter@0.0.2"."blocks" b JOIN "shiyasmohd/counter@0.0.2"."transactions" t ON b._block_num = t._block_num WHERE b._block_num > 12345000 LIMIT 50;',
          category: 'Joins',
          difficulty: 'Advanced'
        },
        {
          name: 'Calculate Total Value Transferred',
          description: 'Calculate the total value transferred in recent blocks',
          query: 'SELECT SUM(CAST(value AS DECIMAL)) as total_value, COUNT(*) as tx_count FROM "shiyasmohd/counter@0.0.2"."transactions" WHERE _block_num > (SELECT MAX(_block_num) - 100 FROM "shiyasmohd/counter@0.0.2"."transactions");',
          category: 'Aggregations',
          difficulty: 'Advanced'
        },
        {
          name: 'Time-Based Query',
          description: 'Get blocks from a specific time period',
          query: 'SELECT * FROM "shiyasmohd/counter@0.0.2"."blocks" WHERE timestamp >= EXTRACT(EPOCH FROM TIMESTAMP \'2024-01-01\') AND timestamp < EXTRACT(EPOCH FROM TIMESTAMP \'2024-02-01\') ORDER BY _block_num;',
          category: 'Time-Based',
          difficulty: 'Intermediate'
        },
        {
          name: 'Most Active Addresses',
          description: 'Find the most active addresses by transaction count',
          query: 'SELECT from_address, COUNT(*) as tx_count FROM "shiyasmohd/counter@0.0.2"."transactions" GROUP BY from_address ORDER BY tx_count DESC LIMIT 20;',
          category: 'Analytics',
          difficulty: 'Intermediate'
        }
      ],
      tips: [
        'Always use ORDER BY with LIMIT to ensure consistent results',
        'Use fully qualified table names: "namespace/dataset@version"."table_name"',
        'Block numbers are stored in the _block_num column',
        'Use indexes on _block_num for better performance',
        'For large datasets, consider using WHERE clauses to filter data before aggregating',
        'Timestamp values are typically stored as Unix epoch timestamps',
        'Event topics are stored as hex strings (0x...)',
        'Use CAST() when performing arithmetic operations on string values'
      ],
      commonPatterns: {
        blockRange: 'WHERE _block_num BETWEEN {start} AND {end}',
        recentBlocks: 'WHERE _block_num > (SELECT MAX(_block_num) - {count} FROM table)',
        addressFilter: 'WHERE from_address = \'{address}\' OR to_address = \'{address}\'',
        eventSignature: 'WHERE topic0 = \'{eventSignatureHash}\'',
        timeRange: 'WHERE timestamp >= {startEpoch} AND timestamp < {endEpoch}'
      }
    };

    return this.createJsonContent('amp://examples', examples);
  }

  private async getAmpDocumentation(): Promise<IMCPResourceContent> {
    const documentation = `# Amp Query Documentation

## Overview
Amp is a hosted service that allows you to query blockchain data using SQL. It provides a powerful and familiar interface for analyzing on-chain data.

## Dataset Naming Convention
Datasets follow the pattern: \`"namespace/dataset@version"."table_name"\`

Example:
\`\`\`sql
SELECT * FROM "shiyasmohd/counter@0.0.2"."blocks"
\`\`\`

## Common Tables

### Blocks
Contains blockchain block data with columns like:
- \`_block_num\` - Block number (indexed)
- \`timestamp\` - Block timestamp (Unix epoch)
- \`hash\` - Block hash
- \`parent_hash\` - Previous block hash
- \`miner\` - Block miner address
- \`gas_limit\`, \`gas_used\` - Gas metrics

### Transactions
Contains transaction data:
- \`_block_num\` - Block number where transaction was included
- \`hash\` - Transaction hash
- \`from_address\` - Sender address
- \`to_address\` - Recipient address
- \`value\` - Value transferred (as string, use CAST for math)
- \`gas\`, \`gas_price\` - Gas metrics
- \`nonce\` - Transaction nonce

### Events
Contains smart contract events:
- \`_block_num\` - Block number
- \`address\` - Contract address that emitted the event
- \`topic0\`, \`topic1\`, \`topic2\`, \`topic3\` - Event topics (topic0 is the event signature)
- \`data\` - Event data

## Query Patterns

### Basic Queries
\`\`\`sql
-- Get recent blocks
SELECT * FROM "namespace/dataset@version"."blocks"
ORDER BY _block_num DESC
LIMIT 100;

-- Get specific block
SELECT * FROM "namespace/dataset@version"."blocks"
WHERE _block_num = 12345678;
\`\`\`

### Filtering
\`\`\`sql
-- Filter by address
SELECT * FROM "namespace/dataset@version"."transactions"
WHERE from_address = '0x123...'
   OR to_address = '0x123...';

-- Filter by event signature
SELECT * FROM "namespace/dataset@version"."events"
WHERE topic0 = '0xddf252ad...';
\`\`\`

### Aggregations
\`\`\`sql
-- Count transactions per block
SELECT _block_num, COUNT(*) as tx_count
FROM "namespace/dataset@version"."transactions"
GROUP BY _block_num
ORDER BY _block_num DESC;

-- Sum values
SELECT SUM(CAST(value AS DECIMAL)) as total_value
FROM "namespace/dataset@version"."transactions"
WHERE _block_num > 12345000;
\`\`\`

### Joins
\`\`\`sql
-- Join blocks and transactions
SELECT b._block_num, b.timestamp, t.hash, t.value
FROM "namespace/dataset@version"."blocks" b
JOIN "namespace/dataset@version"."transactions" t
  ON b._block_num = t._block_num
WHERE b._block_num > 12345000
LIMIT 100;
\`\`\`

## Best Practices

1. **Always use LIMIT** to prevent accidentally querying too much data
2. **Filter on indexed columns** like \`_block_num\` for better performance
3. **Use ORDER BY** with LIMIT to ensure consistent results
4. **Cast string values** to numeric types when doing math operations
5. **Use fully qualified names** for tables to avoid ambiguity
6. **Consider time ranges** when querying historical data
7. **You can use the tool amp_dataset_manifest** to fetch dataset manifests programmatically. That will help you understand the schema and available tables.

## Common Gotchas

- **Values are strings**: Transaction values and other numeric fields are often stored as strings. Use \`CAST(value AS DECIMAL)\` for arithmetic.
- **Timestamps are epoch**: Block timestamps are Unix epoch seconds, not formatted dates.
- **Topics are hex**: Event topics are hex strings (0x...) representing keccak256 hashes.
- **Case sensitivity**: Addresses and hashes are case-sensitive in some databases.

## Configuration

Amp queries can be configured using environment variables in your \`.env\` file:

\`\`\`
AMP_QUERY_URL=https://gateway.amp.example.com
AMP_QUERY_TOKEN=your-auth-token
\`\`\`

`;

    return this.createTextContent('amp://documentation', documentation);
  }
}
