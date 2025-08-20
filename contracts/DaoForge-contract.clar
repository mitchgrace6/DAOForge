;; DAOForge Smart Contract
;; Framework for decentralized autonomous organizations (DAOs) with proposal voting and treasury management
;; Commit 1: Core data structures, constants, and basic functionality

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

;; Voting periods (in blocks)
(define-constant VOTING-PERIOD u1008) ;; ~1 week at 10min blocks
(define-constant MIN-QUORUM u1000) ;; Minimum tokens needed for quorum (10 STX)
(define-constant EXECUTION-DELAY u144) ;; ~1 day delay before execution

;; =================================
;; DATA MAPS AND VARIABLES
;; =================================

;; Global DAO state
(define-data-var dao-name (string-utf8 50) u"DAOForge DAO")
(define-data-var dao-description (string-utf8 500) u"A decentralized autonomous organization built with DAOForge")
(define-data-var total-supply uint u0)
(define-data-var proposal-count uint u0)
(define-data-var treasury-balance uint u0)

;; Governance token balances
(define-map token-balances 
    principal 
    uint
)

;; Member registry
(define-map dao-members
    principal
    {
        joined-at: uint,
        voting-power: uint,
        proposals-created: uint,
        votes-cast: uint
    }
)

;; Proposal structure
(define-map proposals
    uint ;; proposal-id
    {
        proposer: principal,
        title: (string-utf8 100),
        description: (string-utf8 1000),
        proposal-type: (string-ascii 20), ;; "treasury-spend", "parameter-change", "member-action"
        target: (optional principal),
        amount: uint,
        created-at: uint,
        voting-end: uint,
        execution-delay-end: uint,
        status: (string-ascii 10), ;; "active", "passed", "rejected", "executed"
        votes-for: uint,
        votes-against: uint,
        total-votes: uint,
        quorum-required: uint
    }
)

;; Track individual votes
(define-map proposal-votes
    {proposal-id: uint, voter: principal}
    {
        vote: bool, ;; true = for, false = against
        voting-power: uint,
        voted-at: uint
    }
)

;; =================================
;; PRIVATE FUNCTIONS
;; =================================

;; Check if caller is a DAO member
(define-private (is-dao-member (account principal))
    (is-some (map-get? dao-members account))
)

;; Get voting power for an account
(define-private (get-voting-power (account principal))
    (default-to u0 (map-get? token-balances account))
)

;; Calculate quorum requirement (20% of total supply)
(define-private (calculate-quorum)
    (/ (* (var-get total-supply) u20) u100)
)

;; =================================
;; PUBLIC FUNCTIONS - BASIC DAO OPERATIONS
;; =================================

;; Initialize DAO (only contract owner)
(define-public (initialize-dao (name (string-utf8 50)) (description (string-utf8 500)))
    (begin
        (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
        (var-set dao-name name)
        (var-set dao-description description)
        (ok true)
    )
)

;; Join DAO as a member
(define-public (join-dao)
    (let ((current-balance (get-voting-power tx-sender)))
        (asserts! (> current-balance u0) ERR-INSUFFICIENT-TOKENS)
        (map-set dao-members tx-sender {
            joined-at: block-height,
            voting-power: current-balance,
            proposals-created: u0,
            votes-cast: u0
        })
        (ok true)
    )
)

;; Mint governance tokens (only contract owner for initial distribution)
(define-public (mint-tokens (recipient principal) (amount uint))
    (begin
        (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-UNAUTHORIZED)
        (map-set token-balances recipient 
            (+ (default-to u0 (map-get? token-balances recipient)) amount))
        (var-set total-supply (+ (var-get total-supply) amount))
        (ok true)
    )
)

;; Transfer governance tokens
(define-public (transfer-tokens (recipient principal) (amount uint))
    (let ((sender-balance (get-voting-power tx-sender)))
        (asserts! (>= sender-balance amount) ERR-INSUFFICIENT-TOKENS)
        (map-set token-balances tx-sender (- sender-balance amount))
        (map-set token-balances recipient 
            (+ (get-voting-power recipient) amount))
        (ok true)
    )
)