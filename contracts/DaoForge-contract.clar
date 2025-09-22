;; DAOForge Smart Contract - Final Complete Implementation
;; Framework for decentralized autonomous organizations (DAOs) with proposal voting and treasury management
;; Total: 300+ lines implementing full DAO functionality with Clarity best practices

;; =================================
;; CONSTANTS
;; =================================

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-INVALID-PROPOSAL (err u101))
(define-constant ERR-PROPOSAL-NOT-FOUND (err u102))
(define-constant ERR-VOTING-PERIOD-ENDED (err u103))
(define-constant ERR-ALREADY-VOTED (err u104))
(define-constant ERR-INSUFFICIENT-TOKENS (err u105))
(define-constant ERR-PROPOSAL-NOT-ACTIVE (err u106))
(define-constant ERR-PROPOSAL-ALREADY-EXECUTED (err u107))
(define-constant ERR-EXECUTION-FAILED (err u108))
(define-constant ERR-EMERGENCY-PAUSE (err u109))
(define-constant ERR-INVALID-PARAMETERS (err u110))

;; Voting periods (in blocks)
(define-constant VOTING-PERIOD u1008) ;; ~1 week at 10min blocks
(define-constant MIN-QUORUM u1000) ;; Minimum tokens needed for quorum
(define-constant EXECUTION-DELAY u144) ;; ~1 day delay before execution
(define-constant MIN-PROPOSAL-THRESHOLD u10) ;; Minimum tokens to create proposal

;; =================================
;; DATA MAPS AND VARIABLES
;; =================================

;; Global DAO state
(define-data-var dao-name (string-utf8 50) u"DAOForge DAO")
(define-data-var dao-description (string-utf8 500) u"A decentralized autonomous organization built with DAOForge")
(define-data-var total-supply uint u0)
(define-data-var proposal-count uint u0)
(define-data-var treasury-balance uint u0)
(define-data-var transaction-count uint u0)
(define-data-var emergency-pause bool false)
(define-data-var dao-initialized bool false)

;; Configurable parameters
(define-data-var voting-period-blocks uint VOTING-PERIOD)
(define-data-var quorum-percentage uint u20) ;; 20% quorum requirement
(define-data-var execution-delay-blocks uint EXECUTION-DELAY)

;; Governance token balances
(define-map token-balances principal uint)

;; Member registry with enhanced tracking
(define-map dao-members
    principal
    {
        joined-at: uint,
        voting-power: uint,
        proposals-created: uint,
        votes-cast: uint,
        reputation-score: uint,
        active: bool
    }
)

;; Comprehensive proposal structure
(define-map proposals
    uint ;; proposal-id
    {
        proposer: principal,
        title: (string-utf8 100),
        description: (string-utf8 1000),
        proposal-type: (string-ascii 20),
        target: (optional principal),
        amount: uint,
        created-at: uint,
        voting-end: uint,
        execution-delay-end: uint,
        status: (string-ascii 10),
        votes-for: uint,
        votes-against: uint,
        total-votes: uint,
        quorum-required: uint,
        executed-at: (optional uint)
    }
)

;; Individual vote tracking
(define-map proposal-votes
    {proposal-id: uint, voter: principal}
    {
        vote: bool,
        voting-power: uint,
        voted-at: uint,
        delegate: (optional principal)
    }
)

;; Treasury transaction history
(define-map treasury-transactions
    uint
    {
        transaction-type: (string-ascii 15),
        amount: uint,
        from: (optional principal),
        to: (optional principal),
        proposal-id: (optional uint),
        timestamp: uint,
        block-height: uint
    }
)

;; Administrative controls
(define-map admin-roles
    principal
    {
        role: (string-ascii 20), ;; "admin", "moderator", "treasurer"
        granted-by: principal,
        granted-at: uint,
        active: bool
    }
)

;; =================================
;; PRIVATE FUNCTIONS
;; =================================

(define-private (is-dao-member (account principal))
    (match (map-get? dao-members account)
        member-data (get active member-data)
        false
    )
)

(define-private (get-voting-power (account principal))
    (default-to u0 (map-get? token-balances account))
)

(define-private (is-valid-proposal-type (proposal-type (string-ascii 20)))
    (or (is-eq proposal-type "treasury")
        (is-eq proposal-type "parameter")
        (is-eq proposal-type "member")
        (is-eq proposal-type "text")))

(define-private (calculate-quorum-required (supply uint))
    (/ (* supply (var-get quorum-percentage)) u100))

(define-private (has-quorum (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data 
        (>= (get total-votes proposal-data) (get quorum-required proposal-data))
        false))

(define-private (is-proposal-passed (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data
        (and (has-quorum proposal-id)
             (> (get votes-for proposal-data) (get votes-against proposal-data)))
        false))

(define-private (record-treasury-transaction (tx-type (string-ascii 15)) (amount uint) 
                                           (from (optional principal)) (to (optional principal)) 
                                           (proposal-id (optional uint)))
    (let ((tx-id (+ (var-get transaction-count) u1)))
        (map-set treasury-transactions tx-id
            {
                transaction-type: tx-type,
                amount: amount,
                from: from,
                to: to,
                proposal-id: proposal-id,
                timestamp: block-height,
                block-height: block-height
            })
        (var-set transaction-count tx-id)
        (ok tx-id)))

;; =================================
;; PUBLIC FUNCTIONS
;; =================================

;; Initialize DAO with basic parameters
(define-public (initialize-dao (name (string-utf8 50)) (description (string-utf8 500)) (initial-supply uint))
    (begin
        (asserts! (not (var-get dao-initialized)) ERR-UNAUTHORIZED)
        (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
        (asserts! (> initial-supply u0) ERR-INVALID-PARAMETERS)
        
        ;; Set DAO metadata
        (var-set dao-name name)
        (var-set dao-description description)
        (var-set total-supply initial-supply)
        (var-set dao-initialized true)
        
        ;; Give initial tokens to contract owner
        (map-set token-balances CONTRACT-OWNER initial-supply)
        
        ;; Register owner as first member
        (map-set dao-members CONTRACT-OWNER
            {
                joined-at: block-height,
                voting-power: initial-supply,
                proposals-created: u0,
                votes-cast: u0,
                reputation-score: u100,
                active: true
            })
        
        ;; Grant admin role to owner
        (map-set admin-roles CONTRACT-OWNER
            {
                role: "admin",
                granted-by: CONTRACT-OWNER,
                granted-at: block-height,
                active: true
            })
        
        (ok true)))

;; Join DAO as a new member
(define-public (join-dao)
    (begin
        (asserts! (var-get dao-initialized) ERR-UNAUTHORIZED)
        (asserts! (not (is-dao-member tx-sender)) ERR-UNAUTHORIZED)
        
        ;; Register as new member with zero tokens initially
        (map-set dao-members tx-sender
            {
                joined-at: block-height,
                voting-power: u0,
                proposals-created: u0,
                votes-cast: u0,
                reputation-score: u50, ;; Starting reputation
                active: true
            })
        
        (map-set token-balances tx-sender u0)
        (ok true)))

;; Transfer governance tokens between members
(define-public (transfer-tokens (recipient principal) (amount uint))
    (let ((sender-balance (get-voting-power tx-sender))
          (recipient-balance (get-voting-power recipient)))
        (asserts! (var-get dao-initialized) ERR-UNAUTHORIZED)
        (asserts! (is-dao-member tx-sender) ERR-UNAUTHORIZED)
        (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-TOKENS)
        (asserts! (> amount u0) ERR-INVALID-PARAMETERS)
        
        ;; Update balances
        (map-set token-balances tx-sender (- sender-balance amount))
        (map-set token-balances recipient (+ recipient-balance amount))
        
        ;; Update voting power in member data
        (match (map-get? dao-members tx-sender)
            sender-data 
            (map-set dao-members tx-sender (merge sender-data {voting-power: (- sender-balance amount)}))
            false)
        
        (match (map-get? dao-members recipient)
            recipient-data
            (map-set dao-members recipient (merge recipient-data {voting-power: (+ recipient-balance amount)}))
            ;; If recipient not a member, make them one
            (map-set dao-members recipient
                {
                    joined-at: block-height,
                    voting-power: amount,
                    proposals-created: u0,
                    votes-cast: u0,
                    reputation-score: u50,
                    active: true
                }))
        
        (ok true)))

;; Create a new proposal
(define-public (create-proposal (title (string-utf8 100)) (description (string-utf8 1000)) 
                               (proposal-type (string-ascii 20)) (target (optional principal)) (amount uint))
    (let ((proposal-id (+ (var-get proposal-count) u1))
          (sender-tokens (get-voting-power tx-sender))
          (voting-end (+ block-height (var-get voting-period-blocks)))
          (execution-delay-end (+ voting-end (var-get execution-delay-blocks)))
          (quorum-required (calculate-quorum-required (var-get total-supply))))
        
        (asserts! (var-get dao-initialized) ERR-UNAUTHORIZED)
        (asserts! (not (var-get emergency-pause)) ERR-EMERGENCY-PAUSE)
        (asserts! (is-dao-member tx-sender) ERR-UNAUTHORIZED)
        (asserts! (>= sender-tokens MIN-PROPOSAL-THRESHOLD) ERR-INSUFFICIENT-TOKENS)
        (asserts! (is-valid-proposal-type proposal-type) ERR-INVALID-PROPOSAL)
        (asserts! (> (len title) u0) ERR-INVALID-PARAMETERS)
        
        ;; Create proposal
        (map-set proposals proposal-id
            {
                proposer: tx-sender,
                title: title,
                description: description,
                proposal-type: proposal-type,
                target: target,
                amount: amount,
                created-at: block-height,
                voting-end: voting-end,
                execution-delay-end: execution-delay-end,
                status: "active",
                votes-for: u0,
                votes-against: u0,
                total-votes: u0,
                quorum-required: quorum-required,
                executed-at: none
            })
        
        ;; Update counters and member stats
        (var-set proposal-count proposal-id)
        (match (map-get? dao-members tx-sender)
            member-data
            (map-set dao-members tx-sender 
                (merge member-data {proposals-created: (+ (get proposals-created member-data) u1)}))
            false)
        
        (ok proposal-id)))

;; Vote on a proposal
(define-public (vote-on-proposal (proposal-id uint) (vote-for bool))
    (let ((voter-power (get-voting-power tx-sender)))
        (asserts! (var-get dao-initialized) ERR-UNAUTHORIZED)
        (asserts! (not (var-get emergency-pause)) ERR-EMERGENCY-PAUSE)
        (asserts! (is-dao-member tx-sender) ERR-UNAUTHORIZED)
        (asserts! (> voter-power u0) ERR-INSUFFICIENT-TOKENS)
        
        ;; Check proposal exists and is active
        (match (map-get? proposals proposal-id)
            proposal-data
            (begin
                (asserts! (is-eq (get status proposal-data) "active") ERR-PROPOSAL-NOT-ACTIVE)
                (asserts! (<= block-height (get voting-end proposal-data)) ERR-VOTING-PERIOD-ENDED)
                
                ;; Check if already voted
                (asserts! (is-none (map-get? proposal-votes {proposal-id: proposal-id, voter: tx-sender})) 
                         ERR-ALREADY-VOTED)
                
                ;; Record vote
                (map-set proposal-votes {proposal-id: proposal-id, voter: tx-sender}
                    {
                        vote: vote-for,
                        voting-power: voter-power,
                        voted-at: block-height,
                        delegate: none
                    })
                
                ;; Update proposal vote counts
                (if vote-for
                    (map-set proposals proposal-id 
                        (merge proposal-data 
                            {
                                votes-for: (+ (get votes-for proposal-data) voter-power),
                                total-votes: (+ (get total-votes proposal-data) voter-power)
                            }))
                    (map-set proposals proposal-id
                        (merge proposal-data
                            {
                                votes-against: (+ (get votes-against proposal-data) voter-power),
                                total-votes: (+ (get total-votes proposal-data) voter-power)
                            })))
                
                ;; Update member voting stats
                (match (map-get? dao-members tx-sender)
                    member-data
                    (map-set dao-members tx-sender
                        (merge member-data 
                            {
                                votes-cast: (+ (get votes-cast member-data) u1),
                                reputation-score: (+ (get reputation-score member-data) u1)
                            }))
                    false)
                
                (ok true))
            ERR-PROPOSAL-NOT-FOUND)))

;; Execute a passed proposal
(define-public (execute-proposal (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data
        (begin
            (asserts! (var-get dao-initialized) ERR-UNAUTHORIZED)
            (asserts! (not (var-get emergency-pause)) ERR-EMERGENCY-PAUSE)
            (asserts! (is-eq (get status proposal-data) "active") ERR-PROPOSAL-NOT-ACTIVE)
            (asserts! (> block-height (get voting-end proposal-data)) ERR-VOTING-PERIOD-ENDED)
            (asserts! (>= block-height (get execution-delay-end proposal-data)) ERR-EXECUTION-FAILED)
            (asserts! (is-none (get executed-at proposal-data)) ERR-PROPOSAL-ALREADY-EXECUTED)
            (asserts! (is-proposal-passed proposal-id) ERR-EXECUTION-FAILED)
            
            ;; Mark as executed
            (map-set proposals proposal-id
                (merge proposal-data 
                    {
                        status: "executed",
                        executed-at: (some block-height)
                    }))
            
            ;; Execute based on proposal type
            (if (is-eq (get proposal-type proposal-data) "treasury")
                (begin
                    ;; Treasury proposal - transfer STX
                    (asserts! (>= (var-get treasury-balance) (get amount proposal-data)) ERR-INSUFFICIENT-TOKENS)
                    (match (get target proposal-data)
                        target-principal
                        (begin
                            (try! (stx-transfer? (get amount proposal-data) (as-contract tx-sender) target-principal))
                            (var-set treasury-balance (- (var-get treasury-balance) (get amount proposal-data)))
                            (unwrap! (record-treasury-transaction "transfer" (get amount proposal-data) 
                                                             (some (as-contract tx-sender)) (some target-principal) 
                                                             (some proposal-id)) ERR-EXECUTION-FAILED)
                            (ok true))
                        ERR-INVALID-PROPOSAL))
                (ok true)))
        ERR-PROPOSAL-NOT-FOUND))

;; Deposit STX to treasury
(define-public (deposit-to-treasury (amount uint))
    (begin
        (asserts! (var-get dao-initialized) ERR-UNAUTHORIZED)
        (asserts! (> amount u0) ERR-INVALID-PARAMETERS)
        
        (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
        (var-set treasury-balance (+ (var-get treasury-balance) amount))
        (unwrap! (record-treasury-transaction "deposit" amount (some tx-sender) none none) ERR-EXECUTION-FAILED)
        (ok true)))

;; Emergency pause (admin only)
(define-public (set-emergency-pause)
    (begin
        (match (map-get? admin-roles tx-sender)
            admin-data
            (begin
                (asserts! (and (get active admin-data) (is-eq (get role admin-data) "admin")) ERR-UNAUTHORIZED)
                (var-set emergency-pause true)
                (ok true))
            ERR-UNAUTHORIZED)))

;; Resume from emergency pause (admin only)
(define-public (resume-operations)
    (begin
        (match (map-get? admin-roles tx-sender)
            admin-data
            (begin
                (asserts! (and (get active admin-data) (is-eq (get role admin-data) "admin")) ERR-UNAUTHORIZED)
                (var-set emergency-pause false)
                (ok true))
            ERR-UNAUTHORIZED)))

;; =================================
;; READ-ONLY FUNCTIONS
;; =================================

(define-read-only (get-dao-info)
    {
        name: (var-get dao-name),
        description: (var-get dao-description),
        total-supply: (var-get total-supply),
        treasury-balance: (var-get treasury-balance),
        proposal-count: (var-get proposal-count),
        initialized: (var-get dao-initialized),
        emergency-pause: (var-get emergency-pause)
    })

(define-read-only (get-member-info (member principal))
    (map-get? dao-members member))

(define-read-only (get-token-balance (account principal))
    (default-to u0 (map-get? token-balances account)))

(define-read-only (get-proposal (proposal-id uint))
    (map-get? proposals proposal-id))

(define-read-only (get-vote (proposal-id uint) (voter principal))
    (map-get? proposal-votes {proposal-id: proposal-id, voter: voter}))

(define-read-only (get-treasury-transaction (tx-id uint))
    (map-get? treasury-transactions tx-id))

(define-read-only (has-voted (proposal-id uint) (voter principal))
    (is-some (map-get? proposal-votes {proposal-id: proposal-id, voter: voter})))

(define-read-only (get-voting-period)
    (var-get voting-period-blocks))

(define-read-only (get-quorum-percentage)
    (var-get quorum-percentage))

(define-read-only (is-proposal-active (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data
        (and (is-eq (get status proposal-data) "active")
             (<= block-height (get voting-end proposal-data)))
        false))

(define-read-only (get-proposal-result (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data
        {
            passed: (is-proposal-passed proposal-id),
            has-quorum: (has-quorum proposal-id),
            votes-for: (get votes-for proposal-data),
            votes-against: (get votes-against proposal-data),
            total-votes: (get total-votes proposal-data),
            quorum-required: (get quorum-required proposal-data)
        }
        {
            passed: false,
            has-quorum: false,
            votes-for: u0,
            votes-against: u0,
            total-votes: u0,
            quorum-required: u0
        }))