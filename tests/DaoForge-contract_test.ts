
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure DAO can be initialized properly by contract owner",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Test DAO"),
                types.utf8("A test decentralized autonomous organization"),
                types.uint(10000)
            ], deployer.address)
        ]);
        
        block.receipts[0].result.expectOk().expectBool(true);
        assertEquals(block.receipts.length, 1);
        assertEquals(block.height, 2);
        
        // Verify DAO info was set correctly
        let daoInfo = chain.callReadOnlyFn("DaoForge-contract", "get-dao-info", [], deployer.address);
        let daoData = daoInfo.result.expectTuple() as any;
        assertEquals(daoData["name"], types.utf8("Test DAO"));
        assertEquals(daoData["description"], types.utf8("A test decentralized autonomous organization"));
        assertEquals(daoData["total-supply"], types.uint(10000));
        assertEquals(daoData["initialized"], types.bool(true));
        assertEquals(daoData["emergency-pause"], types.bool(false));
        
        // Verify deployer got initial tokens
        let balance = chain.callReadOnlyFn("DaoForge-contract", "get-token-balance", [types.principal(deployer.address)], deployer.address);
        balance.result.expectUint(10000);
        
        // Verify deployer is registered as member
        let memberInfo = chain.callReadOnlyFn("DaoForge-contract", "get-member-info", [types.principal(deployer.address)], deployer.address);
        let memberData = memberInfo.result.expectSome().expectTuple() as any;
        assertEquals(memberData["voting-power"], types.uint(10000));
        assertEquals(memberData["active"], types.bool(true));
        assertEquals(memberData["reputation-score"], types.uint(100));
    },
});

Clarinet.test({
    name: "Ensure non-owner cannot initialize DAO",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Unauthorized DAO"),
                types.utf8("Should fail"),
                types.uint(5000)
            ], wallet1.address)
        ]);
        
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
        assertEquals(block.receipts.length, 1);
    },
});

Clarinet.test({
    name: "Ensure DAO cannot be initialized twice",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        
        // First initialization should succeed
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("First DAO"),
                types.utf8("First initialization"),
                types.uint(8000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Second initialization should fail
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Second DAO"),
                types.utf8("Should fail"),
                types.uint(5000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure initialization fails with invalid parameters",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        
        // Try to initialize with zero supply
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Invalid DAO"),
                types.utf8("Zero supply test"),
                types.uint(0)
            ], deployer.address)
        ]);
        
        block.receipts[0].result.expectErr().expectUint(110); // ERR-INVALID-PARAMETERS
        assertEquals(block.receipts.length, 1);
    },
});

Clarinet.test({
    name: "Ensure members can join DAO after initialization",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        let wallet2 = accounts.get("wallet_2")!;
        
        // Initialize DAO first
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Membership DAO"),
                types.utf8("Testing membership functionality"),
                types.uint(15000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Members join DAO
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address),
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet2.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        block.receipts[0].result.expectOk().expectBool(true);
        block.receipts[1].result.expectOk().expectBool(true);
        
        // Verify members are registered with correct initial values
        let member1Info = chain.callReadOnlyFn("DaoForge-contract", "get-member-info", [types.principal(wallet1.address)], deployer.address);
        let member1Data = member1Info.result.expectSome().expectTuple() as any;
        assertEquals(member1Data["voting-power"], types.uint(0));
        assertEquals(member1Data["active"], types.bool(true));
        assertEquals(member1Data["reputation-score"], types.uint(50));
        assertEquals(member1Data["proposals-created"], types.uint(0));
        assertEquals(member1Data["votes-cast"], types.uint(0));
        
        let member2Info = chain.callReadOnlyFn("DaoForge-contract", "get-member-info", [types.principal(wallet2.address)], deployer.address);
        let member2Data = member2Info.result.expectSome().expectTuple() as any;
        assertEquals(member2Data["voting-power"], types.uint(0));
        assertEquals(member2Data["active"], types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure members cannot join uninitialized DAO",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let wallet1 = accounts.get("wallet_1")!;
        
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address)
        ]);
        
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
        assertEquals(block.receipts.length, 1);
    },
});

Clarinet.test({
    name: "Ensure members cannot join DAO twice",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        // Initialize DAO
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Double Join Test DAO"),
                types.utf8("Testing duplicate membership prevention"),
                types.uint(12000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // First join should succeed
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Second join should fail
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure token transfers work correctly between members",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        let wallet2 = accounts.get("wallet_2")!;
        
        // Initialize DAO and add members
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Token Transfer DAO"),
                types.utf8("Testing token transfer functionality"),
                types.uint(20000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address),
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet2.address)
        ]);
        assertEquals(block.receipts.length, 2);
        
        // Transfer tokens from deployer to wallet1
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet1.address),
                types.uint(5000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify balances updated
        let deployerBalance = chain.callReadOnlyFn("DaoForge-contract", "get-token-balance", [types.principal(deployer.address)], deployer.address);
        deployerBalance.result.expectUint(15000);
        
        let wallet1Balance = chain.callReadOnlyFn("DaoForge-contract", "get-token-balance", [types.principal(wallet1.address)], deployer.address);
        wallet1Balance.result.expectUint(5000);
        
        // Transfer from wallet1 to wallet2
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet2.address),
                types.uint(2000)
            ], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Verify final balances
        wallet1Balance = chain.callReadOnlyFn("DaoForge-contract", "get-token-balance", [types.principal(wallet1.address)], deployer.address);
        wallet1Balance.result.expectUint(3000);
        
        let wallet2Balance = chain.callReadOnlyFn("DaoForge-contract", "get-token-balance", [types.principal(wallet2.address)], deployer.address);
        wallet2Balance.result.expectUint(2000);
    },
});

Clarinet.test({
    name: "Ensure transfer fails with insufficient balance",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        // Initialize DAO
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Insufficient Balance DAO"),
                types.utf8("Testing insufficient balance scenarios"),
                types.uint(1000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try to transfer more tokens than available
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet1.address),
                types.uint(2000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(105); // ERR-INSUFFICIENT-TOKENS
    },
});

Clarinet.test({
    name: "Ensure transfer fails from uninitialized DAO",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet1.address),
                types.uint(100)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure non-member cannot transfer tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        let wallet2 = accounts.get("wallet_2")!;
        
        // Initialize DAO
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Non-Member Transfer DAO"),
                types.utf8("Testing non-member transfer prevention"),
                types.uint(5000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try transfer from non-member
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet2.address),
                types.uint(100)
            ], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure proposals can be created by members with sufficient tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        // Initialize DAO and setup member with tokens
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Proposal Test DAO"),
                types.utf8("Testing proposal creation functionality"),
                types.uint(25000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Transfer tokens to wallet1 to meet minimum threshold
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet1.address),
                types.uint(100)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Create proposal
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Treasury Funding Proposal"),
                types.utf8("Proposal to fund community development with 5000 tokens from treasury"),
                types.ascii("treasury"),
                types.some(types.principal(wallet1.address)),
                types.uint(5000)
            ], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(1);
        
        // Verify proposal was created correctly
        let proposal = chain.callReadOnlyFn("DaoForge-contract", "get-proposal", [types.uint(1)], deployer.address);
        let proposalData = proposal.result.expectSome().expectTuple() as any;
        assertEquals(proposalData["title"], types.utf8("Treasury Funding Proposal"));
        assertEquals(proposalData["proposal-type"], types.ascii("treasury"));
        assertEquals(proposalData["amount"], types.uint(5000));
        assertEquals(proposalData["status"], types.ascii("active"));
        assertEquals(proposalData["votes-for"], types.uint(0));
        assertEquals(proposalData["votes-against"], types.uint(0));
    },
});

Clarinet.test({
    name: "Ensure proposal creation fails with insufficient tokens",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        // Initialize DAO and add member
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Low Token DAO"),
                types.utf8("Testing minimum token requirements"),
                types.uint(15000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try to create proposal without sufficient tokens (need at least 10)
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Insufficient Token Proposal"),
                types.utf8("Should fail due to insufficient tokens"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(105); // ERR-INSUFFICIENT-TOKENS
    },
});

Clarinet.test({
    name: "Ensure proposal creation fails with invalid proposal type",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        
        // Initialize DAO
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Invalid Type DAO"),
                types.utf8("Testing invalid proposal type validation"),
                types.uint(20000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try to create proposal with invalid type
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Invalid Proposal"),
                types.utf8("Testing invalid proposal type"),
                types.ascii("invalid-type"),
                types.none(),
                types.uint(0)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(101); // ERR-INVALID-PROPOSAL
    },
});

Clarinet.test({
    name: "Ensure proposal creation fails from uninitialized DAO",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Uninitialized Proposal"),
                types.utf8("Should fail"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure proposal creation fails with empty title",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        
        // Initialize DAO
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Empty Title DAO"),
                types.utf8("Testing empty title validation"),
                types.uint(18000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try to create proposal with empty title
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8(""),
                types.utf8("Valid description but empty title"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(110); // ERR-INVALID-PARAMETERS
    },
});

Clarinet.test({
    name: "Ensure multiple valid proposal types are supported",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        let wallet2 = accounts.get("wallet_2")!;
        
        // Initialize DAO and setup members
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Multi-Type Proposal DAO"),
                types.utf8("Testing different proposal types"),
                types.uint(30000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet1.address),
            Tx.contractCall("DaoForge-contract", "join-dao", [], wallet2.address)
        ]);
        assertEquals(block.receipts.length, 2);
        
        // Give tokens to members
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet1.address),
                types.uint(100)
            ], deployer.address),
            Tx.contractCall("DaoForge-contract", "transfer-tokens", [
                types.principal(wallet2.address),
                types.uint(50)
            ], deployer.address)
        ]);
        assertEquals(block.receipts.length, 2);
        
        // Create different types of proposals
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Treasury Proposal"),
                types.utf8("Transfer funds from treasury"),
                types.ascii("treasury"),
                types.some(types.principal(wallet1.address)),
                types.uint(1000)
            ], wallet1.address),
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Parameter Change"),
                types.utf8("Change DAO parameters"),
                types.ascii("parameter"),
                types.none(),
                types.uint(0)
            ], wallet2.address),
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Text Proposal"),
                types.utf8("Discussion proposal without execution"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], deployer.address),
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Member Management"),
                types.utf8("Proposal for member changes"),
                types.ascii("member"),
                types.some(types.principal(wallet1.address)),
                types.uint(0)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 4);
        block.receipts[0].result.expectOk().expectUint(1);
        block.receipts[1].result.expectOk().expectUint(2);
        block.receipts[2].result.expectOk().expectUint(3);
        block.receipts[3].result.expectOk().expectUint(4);
        
        // Verify proposals were created with correct types
        let treasuryProposal = chain.callReadOnlyFn("DaoForge-contract", "get-proposal", [types.uint(1)], deployer.address);
        let treasuryData = treasuryProposal.result.expectSome().expectTuple() as any;
        assertEquals(treasuryData["proposal-type"], types.ascii("treasury"));
        
        let parameterProposal = chain.callReadOnlyFn("DaoForge-contract", "get-proposal", [types.uint(2)], deployer.address);
        let parameterData = parameterProposal.result.expectSome().expectTuple() as any;
        assertEquals(parameterData["proposal-type"], types.ascii("parameter"));
        
        let textProposal = chain.callReadOnlyFn("DaoForge-contract", "get-proposal", [types.uint(3)], deployer.address);
        let textData = textProposal.result.expectSome().expectTuple() as any;
        assertEquals(textData["proposal-type"], types.ascii("text"));
        
        let memberProposal = chain.callReadOnlyFn("DaoForge-contract", "get-proposal", [types.uint(4)], deployer.address);
        let memberData = memberProposal.result.expectSome().expectTuple() as any;
        assertEquals(memberData["proposal-type"], types.ascii("member"));
    },
});

Clarinet.test({
    name: "Ensure proposal counter increments correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        
        // Initialize DAO
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Counter Test DAO"),
                types.utf8("Testing proposal counter functionality"),
                types.uint(22000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Check initial proposal count
        let initialInfo = chain.callReadOnlyFn("DaoForge-contract", "get-dao-info", [], deployer.address);
        let initialData = initialInfo.result.expectTuple() as any;
        assertEquals(initialData["proposal-count"], types.uint(0));
        
        // Create first proposal
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("First Proposal"),
                types.utf8("Testing counter increment"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(1);
        
        // Check proposal count after first proposal
        let afterFirstInfo = chain.callReadOnlyFn("DaoForge-contract", "get-dao-info", [], deployer.address);
        let afterFirstData = afterFirstInfo.result.expectTuple() as any;
        assertEquals(afterFirstData["proposal-count"], types.uint(1));
        
        // Create second proposal
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Second Proposal"),
                types.utf8("Testing counter increment again"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(2);
        
        // Check final proposal count
        let finalInfo = chain.callReadOnlyFn("DaoForge-contract", "get-dao-info", [], deployer.address);
        let finalData = finalInfo.result.expectTuple() as any;
        assertEquals(finalData["proposal-count"], types.uint(2));
    },
});

Clarinet.test({
    name: "Ensure non-members cannot create proposals",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        let wallet1 = accounts.get("wallet_1")!;
        
        // Initialize DAO but don't add wallet1 as member
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Non-Member Proposal DAO"),
                types.utf8("Testing non-member proposal prevention"),
                types.uint(16000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Try to create proposal from non-member
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Unauthorized Proposal"),
                types.utf8("Should fail from non-member"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], wallet1.address)
        ]);
        block.receipts[0].result.expectErr().expectUint(100); // ERR-UNAUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure proposal status and timing are set correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get("deployer")!;
        
        // Initialize DAO
        let block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "initialize-dao", [
                types.utf8("Timing Test DAO"),
                types.utf8("Testing proposal timing and status"),
                types.uint(19000)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectBool(true);
        
        // Create proposal and check timing
        block = chain.mineBlock([
            Tx.contractCall("DaoForge-contract", "create-proposal", [
                types.utf8("Timing Test Proposal"),
                types.utf8("Testing proposal timing calculations"),
                types.ascii("text"),
                types.none(),
                types.uint(0)
            ], deployer.address)
        ]);
        block.receipts[0].result.expectOk().expectUint(1);
        
        // Verify proposal has correct status and timing
        let proposal = chain.callReadOnlyFn("DaoForge-contract", "get-proposal", [types.uint(1)], deployer.address);
        let proposalData = proposal.result.expectSome().expectTuple() as any;
        assertEquals(proposalData["status"], types.ascii("active"));
        
        // Verify proposal is currently active
        let isActive = chain.callReadOnlyFn("DaoForge-contract", "is-proposal-active", [types.uint(1)], deployer.address);
        isActive.result.expectBool(true);
        
        // Verify proposal has execution info
        assertEquals(proposalData["executed-at"], types.none());
    },
});
