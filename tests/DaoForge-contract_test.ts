
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
