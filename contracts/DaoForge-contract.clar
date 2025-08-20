;; DAOForge Smart Contract - Commit 2
;; Adding proposal creation, voting mechanisms, and enhanced member management

;; Previous code from Commit 1...
;; [Include all constants, data structures, and basic functions from Commit 1]

;; =================================
;; ADDITIONAL PRIVATE FUNCTIONS FOR PROPOSALS
;; =================================

;; Validate proposal parameters
(define-private (is-valid-proposal (title (string-utf8 100)) (amount uint) (target (optional principal)))
    (and 
        (> (len title) u0)
        (if (is-some target) 
            (> amount u0) 
            true)
    )
)

;; Check if voting period is active
(define-private (is-voting-active (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data (and 
            (is-eq (get status proposal-data) "active")
            (<= block-height (get voting-end proposal-data)))
        false
    )
)

;; Check if proposal has enough quorum
(define-private (has-quorum (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data (>= (get total-votes proposal-data) (get quorum-required proposal-data))
        false
    )
)

;; Check if proposal passed (majority + quorum)
(define-private (proposal-passed (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data (and 
            (has-quorum proposal-id)
            (> (get votes-for proposal-data) (get votes-against proposal-data)))
        false
    )
)

;; =================================
;; PUBLIC FUNCTIONS - PROPOSAL MANAGEMENT
;; =================================

;; Create a new proposal
(define-public (create-proposal 
    (title (string-utf8 100))
    (description (string-utf8 1000))
    (proposal-type (string-ascii 20))
    (target (optional principal))
    (amount uint))
    (let ((proposal-id (+ (var-get proposal-count) u1))
          (voting-power (get-voting-power tx-sender))
          (quorum-req (calculate-quorum)))
        ;; Validation checks
        (asserts! (is-dao-member tx-sender) ERR-UNAUTHORIZED)
        (asserts! (>= voting-power u10) ERR-INSUFFICIENT-TOKENS) ;; Minimum 10 tokens to create proposal
        (asserts! (is-valid-proposal title amount target) ERR-INVALID-PROPOSAL)
        
        ;; Create the proposal
        (map-set proposals proposal-id {
            proposer: tx-sender,
            title: title,
            description: description,
            proposal-type: proposal-type,
            target: target,
            amount: amount,
            created-at: block-height,
            voting-end: (+ block-height VOTING-PERIOD),
            execution-delay-end: (+ block-height VOTING-PERIOD EXECUTION-DELAY),
            status: "active",
            votes-for: u0,
            votes-against: u0,
            total-votes: u0,
            quorum-required: quorum-req
        })
        
        ;; Update member stats
        (map-set dao-members tx-sender 
            (merge (default-to {joined-at: block-height, voting-power: u0, proposals-created: u0, votes-cast: u0} 
                   (map-get? dao-members tx-sender))
                   {proposals-created: (+ u1 (get proposals-created 
                                             (default-to {joined-at: block-height, voting-power: u0, proposals-created: u0, votes-cast: u0} 
                                                        (map-get? dao-members tx-sender))))}))
        
        ;; Update global counter
        (var-set proposal-count proposal-id)
        (ok proposal-id)
    )
)

;; Cast a vote on a proposal
(define-public (vote-on-proposal (proposal-id uint) (vote-for bool))
    (let ((voter-power (get-voting-power tx-sender))
          (existing-vote (map-get? proposal-votes {proposal-id: proposal-id, voter: tx-sender})))
        ;; Validation checks
        (asserts! (is-dao-member tx-sender) ERR-UNAUTHORIZED)
        (asserts! (> voter-power u0) ERR-INSUFFICIENT-TOKENS)
        (asserts! (is-voting-active proposal-id) ERR-VOTING-PERIOD-ENDED)
        (asserts! (is-none existing-vote) ERR-ALREADY-VOTED)
        
        ;; Record the vote
        (map-set proposal-votes 
            {proposal-id: proposal-id, voter: tx-sender}
            {vote: vote-for, voting-power: voter-power, voted-at: block-height})
        
        ;; Update proposal vote counts
        (match (map-get? proposals proposal-id)
            proposal-data 
            (map-set proposals proposal-id 
                (merge proposal-data {
                    votes-for: (if vote-for 
                                  (+ (get votes-for proposal-data) voter-power)
                                  (get votes-for proposal-data)),
                    votes-against: (if vote-for 
                                      (get votes-against proposal-data)
                                      (+ (get votes-against proposal-data) voter-power)),
                    total-votes: (+ (get total-votes proposal-data) voter-power)
                }))
            (err ERR-PROPOSAL-NOT-FOUND))
        
        ;; Update member voting stats
        (map-set dao-members tx-sender 
            (merge (default-to {joined-at: block-height, voting-power: u0, proposals-created: u0, votes-cast: u0} 
                   (map-get? dao-members tx-sender))
                   {votes-cast: (+ u1 (get votes-cast 
                                      (default-to {joined-at: block-height, voting-power: u0, proposals-created: u0, votes-cast: u0} 
                                                 (map-get? dao-members tx-sender))))}))
        (ok true)
    )
)

;; Finalize proposal after voting period
(define-public (finalize-proposal (proposal-id uint))
    (match (map-get? proposals proposal-id)
        proposal-data
        (begin
            (asserts! (> block-height (get voting-end proposal-data)) ERR-VOTING-PERIOD-ENDED)
            (asserts! (is-eq (get status proposal-data) "active") ERR-PROPOSAL-NOT-ACTIVE)
            
            ;; Determine if proposal passed
            (let ((passed (proposal-passed proposal-id)))
                (map-set proposals proposal-id 
                    (merge proposal-data {
                        status: (if passed "passed" "rejected")
                    }))
                (ok passed)
            )
        )
        ERR-PROPOSAL-NOT-FOUND
    )
)

;; =================================
;; READ-ONLY FUNCTIONS - QUERIES
;; =================================

;; Get DAO information
(define-read-only (get-dao-info)
    {
        name: (var-get dao-name),
        description: (var-get dao-description),
        total-supply: (var-get total-supply),
        proposal-count: (var-get proposal-count),
        treasury-balance: (var-get treasury-balance)
    }
)

;; Get member information
(define-read-only (get-member-info (member principal))
    (map-get? dao-members member)
)

;; Get token balance
(define-read-only (get-balance (account principal))
    (default-to u0 (map-get? token-balances account))
)

;; Get proposal details
(define-read-only (get-proposal (proposal-id uint))
    (map-get? proposals proposal-id)
)

;; Get vote details for a specific voter and proposal
(define-read-only (get-vote (proposal-id uint) (voter principal))
    (map-get? proposal-votes {proposal-id: proposal-id, voter: voter})
)

;; Check if address has voted on proposal
(define-read-only (has-voted (proposal-id uint) (voter principal))
    (is-some (map-get? proposal-votes {proposal-id: proposal-id, voter: voter}))
)