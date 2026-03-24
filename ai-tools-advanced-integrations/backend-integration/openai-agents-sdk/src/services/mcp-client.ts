/**
 * MCP Client for OpenAI Agents SDK
 *
 * Connects to remote MCP servers and provides tools with whitelist filtering.
 * Uses Streamable HTTP transport and Zod 4 for schema conversion.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Tool definition compatible with OpenAI Agents SDK
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<Record<string, z.ZodType>>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// Server configuration
export interface MCPServerConfig {
  name: string;
  url: string;
  apiKey?: string;
  whitelist?: string[];
}

/**
 * Sanitize tool name for OpenAI compatibility
 * Replaces any character that is not alphanumeric, underscore, or hyphen with underscore.
 */
export function sanitizeMCPToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Convert JSON Schema to Zod schema
 * Uses manual conversion to ensure compatibility with OpenAI Agents SDK
 */
export function convertJsonSchemaToZod(jsonSchema: unknown): z.ZodObject<Record<string, z.ZodType>> {
  const schema = jsonSchema as Record<string, unknown>;

  if (!schema || typeof schema !== 'object' || !schema.properties) {
    return z.object({});
  }

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = (schema.required as string[]) || [];
  const shape: Record<string, z.ZodType> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let zodType: z.ZodType;

    switch (prop.type) {
      case 'string':
        zodType = prop.description
          ? z.string().describe(prop.description as string)
          : z.string();
        break;
      case 'number':
      case 'integer':
        zodType = prop.description
          ? z.number().describe(prop.description as string)
          : z.number();
        break;
      case 'boolean':
        zodType = prop.description
          ? z.boolean().describe(prop.description as string)
          : z.boolean();
        break;
      case 'array':
        zodType = prop.description
          ? z.array(z.unknown()).describe(prop.description as string)
          : z.array(z.unknown());
        break;
      case 'object':
        zodType = prop.description
          ? z.record(z.string(), z.unknown()).describe(prop.description as string)
          : z.record(z.string(), z.unknown());
        break;
      default:
        zodType = z.unknown();
    }

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}

/**
 * MCP Client with whitelist support
 */
export class MCPClient {
  private client: Client | null = null;
  private tools: Map<string, Tool> = new Map();
  private connected = false;
  private readonly mcpUrl: string;
  private readonly apiKey?: string;
  private readonly serverName: string;

  constructor(config: MCPServerConfig) {
    this.mcpUrl = config.url;
    this.apiKey = config.apiKey;
    this.serverName = config.name;
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.connected) {
      console.log(`[MCP:${this.serverName}] Already connected`);
      return;
    }

    try {
      // Build request headers for authentication
      const headers: Record<string, string> = {};
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Create Streamable HTTP transport (using SDK's built-in transport)
      const transport = new StreamableHTTPClientTransport(
        new URL(this.mcpUrl),
        {
          requestInit: {
            headers,
          },
        }
      );

      // Create MCP client
      this.client = new Client(
        {
          name: `openai-agents-mcp-client-${this.serverName}`,
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Connect and fetch tools
      await this.client.connect(transport);
      await this.fetchTools();
      this.connected = true;
    } catch (error) {
      console.error(`[MCP:${this.serverName}] Connection error:`, error);
      throw new Error(`Failed to connect to MCP server ${this.serverName}: ${(error as Error).message}`);
    }
  }

  /**
   * Fetch available tools from the MCP server
   */
  private async fetchTools(): Promise<void> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }

    console.log(`[MCP:${this.serverName}] Fetching tools from server...`);
    const response = await this.client.listTools();

    console.log(`[MCP:${this.serverName}] ===============================================`);
    console.log(`[MCP:${this.serverName}] TOTAL TOOLS AVAILABLE: ${response.tools.length}`);
    console.log(`[MCP:${this.serverName}] ===============================================`);

    this.tools.clear();
    for (const tool of response.tools) {
      console.log(`[MCP:${this.serverName}] - Tool found: ${tool.name}`);
      this.tools.set(tool.name, tool);
    }

    console.log(`[MCP:${this.serverName}] Stored ${this.tools.size} tools in cache`);
  }

  /**
   * Get tool definitions with optional whitelist filtering
   */
  getToolDefinitions(whitelist?: string[]): MCPToolDefinition[] {
    console.log(`[MCP:${this.serverName}] ===============================================`);
    console.log(`[MCP:${this.serverName}] getToolDefinitions() called`);
    console.log(`[MCP:${this.serverName}] Total tools in cache: ${this.tools.size}`);
    console.log(`[MCP:${this.serverName}] Whitelist provided: ${whitelist ? JSON.stringify(whitelist) : 'NONE (all tools allowed)'}`);
    console.log(`[MCP:${this.serverName}] ===============================================`);

    const definitions: MCPToolDefinition[] = [];
    let skippedCount = 0;

    for (const [name, tool] of this.tools.entries()) {
      console.log(`[MCP:${this.serverName}] Processing tool: ${name}`);

      // Skip if not in whitelist
      if (whitelist && whitelist.length > 0 && !whitelist.includes(name)) {
        console.log(`[MCP:${this.serverName}]   ❌ SKIPPED (not in whitelist)`);
        skippedCount++;
        continue;
      }

      console.log(`[MCP:${this.serverName}]   ✅ INCLUDED`);

      try {
        // Sanitize tool name (OpenAI requires ^[a-zA-Z0-9_-]+$)
        const sanitizedName = this.sanitizeToolName(name);

        // Convert JSON Schema to Zod using Zod 4's native support
        const inputSchema = this.jsonSchemaToZod(tool.inputSchema);

        definitions.push({
          name: sanitizedName,
          description: tool.description || `MCP tool: ${name}`,
          inputSchema,
          execute: async (args: Record<string, unknown>) => {
            return await this.executeTool(name, args);
          },
        });
      } catch (error) {
        console.error(`[MCP:${this.serverName}] Error converting tool ${name}:`, error);
      }
    }

    console.log(`[MCP:${this.serverName}] ===============================================`);
    console.log(`[MCP:${this.serverName}] SUMMARY:`);
    console.log(`[MCP:${this.serverName}]   Total available: ${this.tools.size}`);
    console.log(`[MCP:${this.serverName}]   Included: ${definitions.length}`);
    console.log(`[MCP:${this.serverName}]   Skipped: ${skippedCount}`);
    console.log(`[MCP:${this.serverName}]   Tool names: ${definitions.map(d => d.name).join(', ') || 'NONE'}`);
    console.log(`[MCP:${this.serverName}] ===============================================`);

    return definitions;
  }

  /**
   * Sanitize tool name for OpenAI compatibility
   */
  private sanitizeToolName(name: string): string {
    return sanitizeMCPToolName(name);
  }

  /**
   * Convert JSON Schema to Zod schema
   * Uses manual conversion to ensure compatibility with OpenAI Agents SDK
   */
  private jsonSchemaToZod(jsonSchema: unknown): z.ZodObject<Record<string, z.ZodType>> {
    return convertJsonSchemaToZod(jsonSchema);
  }

  /**
   * Execute a tool on the MCP server
   */
  async executeTool(toolName: string, args: unknown): Promise<unknown> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    if (!this.tools.has(toolName)) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    console.log(`[MCP:${this.serverName}] Executing: ${toolName}`, JSON.stringify(args).substring(0, 200));

    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: args as Record<string, unknown>,
      });

      console.log(`[MCP:${this.serverName}] Response received for: ${toolName}`);
      console.log(`[MCP:${this.serverName}] Response structure:`, {
        hasContent: !!response.content,
        contentType: Array.isArray(response.content) ? 'array' : typeof response.content,
        contentLength: Array.isArray(response.content) ? response.content.length : 'N/A',
        isError: !!response.isError,
      });

      // Handle error responses - return error object instead of throwing
      // This allows the agent to see the actual error message
      if (response.isError) {
        const content = response.content as Array<{ type: string; text?: string }> | undefined;
        let errorMessage = 'Unknown error';
        let errorDetails: unknown = null;

        if (Array.isArray(content) && content.length > 0) {
          const firstItem = content[0];
          if (firstItem.type === 'text' && firstItem.text) {
            // Try to parse error as JSON to get structured error info
            try {
              const parsed = JSON.parse(firstItem.text);
              
              // Handle different error response structures
              // Structure 1: { error: { msg: "...", code: "..." } }
              if (parsed.error && typeof parsed.error === 'object') {
                errorMessage = parsed.error.msg || parsed.error.message || JSON.stringify(parsed.error);
                errorDetails = parsed;
              }
              // Structure 2: { message: "...", error: "..." }
              else if (parsed.message || parsed.error) {
                errorMessage = parsed.message || parsed.error || firstItem.text;
                errorDetails = parsed;
              }
              // Structure 3: Direct error object
              else {
                errorMessage = firstItem.text;
                errorDetails = parsed;
              }
            } catch {
              errorMessage = firstItem.text;
            }
          } else {
            errorMessage = JSON.stringify(firstItem);
          }
        }

        console.error(`[MCP:${this.serverName}] Tool error:`, errorMessage);
        console.error(`[MCP:${this.serverName}] Error details:`, JSON.stringify(errorDetails, null, 2));

        // Return error object instead of throwing - agent can see this
        return {
          error: true,
          message: errorMessage,
          details: errorDetails,
          toolName,
        };
      }

      // Extract content from response
      const content = response.content as Array<{ type: string; text?: string; resource?: unknown }>;
      if (content && Array.isArray(content) && content.length > 0) {
        const first = content[0];
        console.log(`[MCP:${this.serverName}] First content item:`, {
          type: first.type,
          hasText: !!first.text,
          textLength: first.text?.length || 0,
        });

        if (first.type === 'text' && first.text) {
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(first.text);
            
            // Check if the parsed result contains an error (e.g., async job failure)
            // Structure: { status: "failure", error: { msg: "...", code: "..." } }
            if (parsed.status === 'failure' || parsed.status === 'error') {
              const errorMsg = parsed.error?.msg || parsed.error?.message || parsed.message || 'Job failed';
              console.error(`[MCP:${this.serverName}] Job failed:`, errorMsg);
              console.error(`[MCP:${this.serverName}] Full error details:`, JSON.stringify(parsed, null, 2));
              
              return {
                error: true,
                message: errorMsg,
                details: parsed,
                toolName,
              };
            }
            
            // Check if there's an error field even if status is not failure
            if (parsed.error && typeof parsed.error === 'object' && parsed.data?.status === 'failure') {
              const errorMsg = parsed.data.error?.msg || parsed.data.error?.message || parsed.error.msg || parsed.error.message || JSON.stringify(parsed.error);
              console.error(`[MCP:${this.serverName}] Response contains error:`, errorMsg);
              
              return {
                error: true,
                message: errorMsg,
                details: parsed,
                toolName,
              };
            }
            
            console.log(`[MCP:${this.serverName}] Successfully parsed JSON result (${JSON.stringify(parsed).length} chars)`);
            console.log(`[MCP:${this.serverName}] Result preview:`, JSON.stringify(parsed).substring(0, 300));
            return parsed;
          } catch (parseError) {
            // Try to extract JSON from within the text (e.g., markdown code blocks, extra content)
            const jsonMatch = first.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const extracted = JSON.parse(jsonMatch[0]);
                console.log(`[MCP:${this.serverName}] Extracted JSON from text via regex (${JSON.stringify(extracted).length} chars)`);
                if (extracted.status === 'failure' || extracted.status === 'error') {
                  const errorMsg = extracted.error?.msg || extracted.error?.message || extracted.message || 'Job failed';
                  console.error(`[MCP:${this.serverName}] Job failed:`, errorMsg);
                  return { error: true, message: errorMsg, details: extracted, toolName };
                }
                return extracted;
              } catch {
                // Regex-extracted text also not valid JSON, fall through
              }
            }
            console.log(`[MCP:${this.serverName}] Result is not JSON, returning as text`);
            return { text: first.text };
          }
        }
        
        // Return the first content item if it's not text
        console.log(`[MCP:${this.serverName}] Returning non-text content item`);
        return first;
      }

      // Fallback: return the entire response
      console.log(`[MCP:${this.serverName}] No content array found, returning full response`);
      return response;
    } catch (error) {
      console.error(`[MCP:${this.serverName}] Error executing ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.connected = false;
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get server name
   */
  getServerName(): string {
    return this.serverName;
  }
}

// Store MCP client instances
const mcpClients: Map<string, MCPClient> = new Map();

/**
 * Get or create an MCP client by config
 */
export async function getMCPClient(config: MCPServerConfig): Promise<MCPClient> {
  const existing = mcpClients.get(config.name);
  if (existing?.isConnected()) {
    return existing;
  }

  const client = new MCPClient(config);
  await client.connect();
  mcpClients.set(config.name, client);

  return client;
}

/**
 * Get all MCP clients
 */
export function getAllMCPClients(): Map<string, MCPClient> {
  return mcpClients;
}

/**
 * Close all MCP clients
 */
export async function closeAllMCPClients(): Promise<void> {
  for (const [name, client] of mcpClients) {
    await client.disconnect();
    mcpClients.delete(name);
  }
}

/**
 * Parse MCP server configurations from environment variables
 *
 * Supports:
 * - CARTO_MCP_URL + CARTO_MCP_API_KEY (single server)
 * - MCP_WHITELIST_CARTO=tool1,tool2,tool3 (optional whitelist)
 */
export function parseMCPServerConfigs(): MCPServerConfig[] {
  console.log('[MCP] ===============================================');
  console.log('[MCP] Parsing MCP server configurations from environment...');
  console.log('[MCP] CARTO_MCP_URL:', process.env.CARTO_MCP_URL || 'NOT SET');
  console.log('[MCP] CARTO_MCP_API_KEY:', process.env.CARTO_MCP_API_KEY ? 'SET (hidden)' : 'NOT SET');
  console.log('[MCP] MCP_WHITELIST_CARTO:', process.env.MCP_WHITELIST_CARTO || 'NOT SET (all tools allowed)');
  console.log('[MCP] ===============================================');

  const configs: MCPServerConfig[] = [];

  // Check for CARTO MCP server
  const cartoUrl = process.env.CARTO_MCP_URL;
  if (cartoUrl) {
    const whitelistEnv = process.env.MCP_WHITELIST_CARTO;
    const whitelist = whitelistEnv ? whitelistEnv.split(',').map((t) => t.trim()) : undefined;

    const config = {
      name: 'carto',
      url: cartoUrl,
      apiKey: process.env.CARTO_MCP_API_KEY,
      whitelist,
    };

    console.log('[MCP] Added CARTO MCP server configuration:', {
      name: config.name,
      url: config.url,
      hasApiKey: !!config.apiKey,
      whitelist: config.whitelist || 'NONE (all tools allowed)',
    });

    configs.push(config);
  } else {
    console.log('[MCP] No CARTO_MCP_URL found - MCP disabled');
  }

  console.log(`[MCP] Total configurations: ${configs.length}`);
  return configs;
}
