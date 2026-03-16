/**
 * MCP Mock Fixtures for CI/testing
 *
 * Provides fixture-backed mock tools that replace real MCP server connections
 * when MCP_MOCK_MODE=true. Returns deterministic, pre-recorded responses
 * for the 4 whitelisted MCP tools.
 */

import { z } from 'zod';

export interface MCPMockFixture {
  description: string;
  inputSchema: z.ZodObject<Record<string, z.ZodType>>;
  response: unknown;
  validateInput?: (args: Record<string, unknown>) => void;
}

export type MCPMockFixtures = Record<string, MCPMockFixture>;

export const MCP_MOCK_FIXTURES: MCPMockFixtures = {
  // ── Tool 1: ai_tools_filter_pois ──
  ai_tools_filter_pois: {
    description: 'Filter Points of Interest in a geographic area',
    inputSchema: z.object({
      latitude: z.number().describe('Center latitude'),
      longitude: z.number().describe('Center longitude'),
      category: z.string().describe('POI category to filter'),
      radius: z.number().optional().describe('Search radius in meters'),
    }),
    response: {
      job_id: 'mock-pois-job-001',
      status: 'submitted',
    },
    validateInput: (args) => {
      if (typeof args.latitude !== 'number' || typeof args.longitude !== 'number') {
        console.warn('[MCP:mock] ai_tools_filter_pois missing lat/lng');
      }
    },
  },

  // ── Tool 2: ai_tools_drivetime_demographics ──
  ai_tools_drivetime_demographics: {
    description: 'Calculate demographics within a drive-time area',
    inputSchema: z.object({
      latitude: z.number().describe('Center point latitude'),
      longitude: z.number().describe('Center point longitude'),
      time_minutes: z.number().optional().describe('Drive time in minutes'),
    }),
    response: {
      job_id: 'mock-drivetime-job-001',
      status: 'submitted',
    },
  },

  // ── Tool 3: async_workflow_job_get_status_v1_0_0 ──
  async_workflow_job_get_status_v1_0_0: {
    description: 'Get the status of an async workflow job',
    inputSchema: z.object({
      job_id: z.string().describe('The job ID to check status for'),
    }),
    response: {
      status: 'completed',
    },
  },

  // ── Tool 4: async_workflow_job_get_results_v1_0_0 ──
  async_workflow_job_get_results_v1_0_0: {
    description: 'Get the results of a completed async workflow job',
    inputSchema: z.object({
      job_id: z.string().describe('The job ID to get results for'),
      workflowOutputTableName: z.string().describe('Output table name for workflow results'),
    }),
    // Response structure matches what agent-runner.ts extractCoordinatesFromMcpResult() expects:
    // data.rows[0].latitude and data.rows[0].longitude
    response: {
      data: {
        rows: [
          {
            latitude: 40.758,
            longitude: -73.9855,
            total_population: 45230,
            median_income: 72500,
            name: 'Times Square Area',
          },
        ],
        total_rows: 1,
      },
      workflowOutputTableName: 'carto-dw-ac-7xhfwyml.shared.mock_mcp_result',
    },
  },
};
