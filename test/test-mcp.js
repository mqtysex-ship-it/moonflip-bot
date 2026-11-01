import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDiscordMcpServer } from '../src/server.js';
import { destroyDiscordClient } from '../src/discord.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.error(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.error('\n=== Starting Discord MCP Server Test Suite ===\n');

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createDiscordMcpServer();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  // Test 1: Tool Listing
  console.error('--- Test 1: Verify Available MCP Tools ---');
  const toolList = await client.listTools();
  const toolNames = toolList.tools.map((t) => t.name);

  const expectedTools = [
    'discord_list_servers',
    'discord_get_server',
    'discord_create_category',
    'discord_create_channel',
    'discord_create_role',
    'discord_set_channel_permissions',
    'discord_set_role_permissions',
    'discord_plan_server_setup',
    'discord_apply_server_setup',
  ];

  for (const exp of expectedTools) {
    assert(toolNames.includes(exp), `Tool registered: ${exp}`);
  }

  // Test 2: Discord Connection & List Servers
  console.error('\n--- Test 2: Discord Connection & list_servers ---');
  const listResult = await client.callTool({
    name: 'discord_list_servers',
    arguments: {},
  });

  assert(listResult && listResult.content && listResult.content.length > 0, 'discord_list_servers returned content');
  const listData = JSON.parse(listResult.content[0].text);
  assert(typeof listData.count === 'number', `Server count returned: ${listData.count}`);
  assert(listData.inviteUrl && listData.inviteUrl.includes('discord.com/oauth2/authorize'), 'Bot OAuth2 invite link is generated');

  // Verify credentials not leaked
  const token = process.env.DISCORD_BOT_TOKEN;
  assert(!listResult.content[0].text.includes(token), 'Bot token is not exposed in tool output');

  // Test 3: Approval Requirement on Mutating Tools
  console.error('\n--- Test 3: User Approval Enforcement ---');
  
  // Create category without confirmation
  const catResult = await client.callTool({
    name: 'discord_create_category',
    arguments: { guildId: '123456789012345678', name: 'Test Category', confirmed: false },
  });
  const catData = JSON.parse(catResult.content[0].text);
  assert(catData.status === 'APPROVAL_REQUIRED', 'discord_create_category requires confirmation');

  // Create channel without confirmation
  const chResult = await client.callTool({
    name: 'discord_create_channel',
    arguments: { guildId: '123456789012345678', name: 'general', confirmed: false },
  });
  const chData = JSON.parse(chResult.content[0].text);
  assert(chData.status === 'APPROVAL_REQUIRED', 'discord_create_channel requires confirmation');

  // Create role without confirmation
  const roleResult = await client.callTool({
    name: 'discord_create_role',
    arguments: { guildId: '123456789012345678', name: 'Developer', confirmed: false },
  });
  const roleData = JSON.parse(roleResult.content[0].text);
  assert(roleData.status === 'APPROVAL_REQUIRED', 'discord_create_role requires confirmation');

  // Set channel permissions without confirmation
  const permResult = await client.callTool({
    name: 'discord_set_channel_permissions',
    arguments: {
      guildId: '123456789012345678',
      channelId: '987654321098765432',
      targetId: '@everyone',
      allow: ['ViewChannel'],
      confirmed: false,
    },
  });
  const permData = JSON.parse(permResult.content[0].text);
  assert(permData.status === 'APPROVAL_REQUIRED', 'discord_set_channel_permissions requires confirmation');

  // Apply server setup without confirmation
  const applyResult = await client.callTool({
    name: 'discord_apply_server_setup',
    arguments: { guildId: '123456789012345678', plan: { roles: [] }, confirmed: false },
  });
  const applyData = JSON.parse(applyResult.content[0].text);
  assert(applyData.status === 'APPROVAL_REQUIRED', 'discord_apply_server_setup requires confirmation');

  // Test 4: Automated Setup Planning & Natural-Language Prompts
  console.error('\n--- Test 4: Natural-Language Automated Setup Planning ---');
  
  // Call discord_plan_server_setup tool via MCP client
  const planResult = await client.callTool({
    name: 'discord_plan_server_setup',
    arguments: {
      templateName: 'software_dev',
    },
  });
  assert(planResult && planResult.content && planResult.content.length > 0, 'discord_plan_server_setup returned content');
  const planData = JSON.parse(planResult.content[0].text);
  assert(planData.status === 'PLAN_GENERATED', 'discord_plan_server_setup status is PLAN_GENERATED');
  assert(planData.plan && Array.isArray(planData.plan.roles) && planData.plan.roles.length > 0, 'Plan has roles');
  assert(planData.plan && Array.isArray(planData.plan.categories) && planData.plan.categories.length > 0, 'Plan has categories');
  assert(planData.summaryMarkdown && planData.summaryMarkdown.includes('Proposed Discord Server Setup'), 'Plan has summary markdown');

  // Call discord_plan_server_setup with natural-language prompt
  const nlResult = await client.callTool({
    name: 'discord_plan_server_setup',
    arguments: {
      promptOrSpec: 'I want a gaming server for my clan with voice lobbies',
    },
  });
  const nlData = JSON.parse(nlResult.content[0].text);
  assert(nlData.status === 'PLAN_GENERATED', 'Natural language prompt generates PLAN_GENERATED');
  assert(nlData.plan.roles.some((r) => r.name === 'Moderator'), 'Natural language prompt matched gaming roles');

  console.error('\n=== Test Summary ===');
  console.error(`Passed: ${passed}`);
  console.error(`Failed: ${failed}`);

  await client.close();
  await server.close();
  await destroyDiscordClient();

  if (failed > 0) {
    process.exit(1);
  } else {
    console.error('\nAll tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
