/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/hydra.json`.
 */
export type Hydra = {
  "address": "HmHxoZHi5GN3187RoXPDAXcjY5j1ghTdXn54u9pVzrvp",
  "metadata": {
    "name": "hydra",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Self-replicating agent economy on Solana"
  },
  "instructions": [
    {
      "name": "deactivateAgent",
      "docs": [
        "Deactivate an agent."
      ],
      "discriminator": [
        205,
        171,
        239,
        225,
        82,
        126,
        96,
        166
      ],
      "accounts": [
        {
          "name": "registry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "agent.wallet",
                "account": "agentAccount"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "distributeToParent",
      "docs": [
        "Distribute SOL revenue from child to parent via system transfer."
      ],
      "discriminator": [
        165,
        17,
        210,
        207,
        53,
        28,
        235,
        57
      ],
      "accounts": [
        {
          "name": "childAgent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "childWallet"
              }
            ]
          }
        },
        {
          "name": "parentAgent",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "parentWallet"
              }
            ]
          }
        },
        {
          "name": "childWallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "parentWallet",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "Initialize the Hydra registry. Called once."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "recordEarning",
      "docs": [
        "Record earnings for an agent (called by agent's own wallet)."
      ],
      "discriminator": [
        146,
        64,
        247,
        159,
        128,
        80,
        44,
        56
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "wallet",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "registerRootAgent",
      "docs": [
        "Register the root agent (no parent). Only callable by registry authority."
      ],
      "discriminator": [
        206,
        102,
        146,
        202,
        63,
        197,
        18,
        58
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "agent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "wallet"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "registry"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "specialization",
          "type": "string"
        }
      ]
    },
    {
      "name": "spawnChild",
      "docs": [
        "Parent agent spawns a child agent."
      ],
      "discriminator": [
        57,
        254,
        127,
        116,
        244,
        20,
        212,
        84
      ],
      "accounts": [
        {
          "name": "registry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  103,
                  105,
                  115,
                  116,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "parentAgent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "parentWallet"
              }
            ]
          }
        },
        {
          "name": "childAgent",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  103,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "childWallet"
              }
            ]
          }
        },
        {
          "name": "parentWallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "childWallet"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "specialization",
          "type": "string"
        },
        {
          "name": "revenueShareBps",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "agentAccount",
      "discriminator": [
        241,
        119,
        69,
        140,
        233,
        9,
        112,
        50
      ]
    },
    {
      "name": "registry",
      "discriminator": [
        47,
        174,
        110,
        246,
        184,
        182,
        252,
        218
      ]
    }
  ],
  "events": [
    {
      "name": "agentDeactivated",
      "discriminator": [
        138,
        251,
        82,
        87,
        119,
        148,
        20,
        180
      ]
    },
    {
      "name": "agentRegistered",
      "discriminator": [
        191,
        78,
        217,
        54,
        232,
        100,
        189,
        85
      ]
    },
    {
      "name": "agentSpawned",
      "discriminator": [
        229,
        125,
        60,
        41,
        61,
        109,
        254,
        34
      ]
    },
    {
      "name": "earningRecorded",
      "discriminator": [
        207,
        235,
        171,
        216,
        168,
        79,
        174,
        197
      ]
    },
    {
      "name": "revenueDistributed",
      "discriminator": [
        78,
        195,
        188,
        214,
        203,
        219,
        199,
        87
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "nameTooLong",
      "msg": "Agent name exceeds maximum length"
    },
    {
      "code": 6001,
      "name": "specTooLong",
      "msg": "Specialization exceeds maximum length"
    },
    {
      "code": 6002,
      "name": "invalidRevenueShare",
      "msg": "Revenue share basis points must be <= 10000"
    },
    {
      "code": 6003,
      "name": "agentInactive",
      "msg": "Agent is not active"
    },
    {
      "code": 6004,
      "name": "maxDepthReached",
      "msg": "Maximum agent tree depth reached"
    },
    {
      "code": 6005,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6006,
      "name": "noParentAgent",
      "msg": "Agent has no parent"
    }
  ],
  "types": [
    {
      "name": "agentAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "specialization",
            "type": "string"
          },
          {
            "name": "totalEarned",
            "type": "u64"
          },
          {
            "name": "totalDistributedToParent",
            "type": "u64"
          },
          {
            "name": "childrenCount",
            "type": "u64"
          },
          {
            "name": "depth",
            "type": "u8"
          },
          {
            "name": "revenueShareBps",
            "type": "u16"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "agentDeactivated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "agentRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "specialization",
            "type": "string"
          },
          {
            "name": "depth",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "agentSpawned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "child",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "childWallet",
            "type": "pubkey"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "specialization",
            "type": "string"
          },
          {
            "name": "depth",
            "type": "u8"
          },
          {
            "name": "revenueShareBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "earningRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalEarned",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "registry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "totalAgents",
            "type": "u64"
          },
          {
            "name": "totalEarnings",
            "type": "u64"
          },
          {
            "name": "totalSpawns",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "revenueDistributed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "child",
            "type": "pubkey"
          },
          {
            "name": "parent",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalDistributed",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
