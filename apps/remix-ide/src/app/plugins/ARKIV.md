# Arkiv in Remix IDE

Remix integrates with the [Arkiv Network](https://arkiv.network) to let you publish files and save deployed contracts on-chain — permanently or with a chosen expiry — and retrieve them from any browser.

---

## Share a file

**Right-click any file in the File Explorer → Share to Arkiv**

1. A dialog shows a short privacy notice and a **Data retention** dropdown. Choose how long the file should remain live (7 days / 30 days / 90 days / 1 year / Permanent).
2. Click **Confirm**. Remix signs and submits the transaction.
3. The terminal prints the transaction hash (linked to the Arkiv scanner) and a **share link** of the form `https://app.remix.live?arkiv=<key>`.

Anyone who opens that link in Remix gets a new workspace with the file pre-loaded and open in the editor.

---

## Save a deployed contract

**Deployed Contracts panel → three-dot menu (⋮) on any contract → Save to Arkiv**

> Requires a wallet connected to a persistent network (not Remix VM).

1. The dialog shows the contract address, chain ID, and a **Data retention** dropdown.
2. Click **Confirm**. The ABI is stored on Arkiv, tagged with your wallet address and chain.
3. The terminal confirms the save with a transaction link.

If you save the same contract again (same address + chain + wallet), the existing entry is updated in place (upsert).

---

## Retrieve saved contracts

**Deployed Contracts panel → cloud-download icon (⬇) in the header**

Opens the **Contracts saved on Arkiv** panel, which lists every contract you saved from the connected wallet:

| Column | Details |
|---|---|
| Name | Contract name at save time |
| Address | Abbreviated on-chain address |
| Chain · Date | Network name and save date |
| Retention | `🔒 permanent` or `⏳ N days` |
| Sourcify badge | ✅ green = exact match · 🟡 yellow = partial match (links to sourcify.dev) |

Click **Load** to restore the contract into the Deployed Contracts list exactly as if you had used *At Address*.

---

## Open a shared link

Append `?arkiv=<entityKey>` to any Remix URL (e.g. `https://app.remix.live?arkiv=...`). Remix will:

1. Fetch the file from Arkiv.
2. Create a fresh workspace named `arkiv-<id>`.
3. Open the file in the editor automatically.

---

## Data & privacy

- All data written to Arkiv is **public**. Anyone with the entity key can read it.
- Expiry removes the entity from active indexes but the on-chain record is permanent.
- Every write is tagged `app = remix` on-chain, enabling usage analytics for both teams.
- Contract ABIs are stored as the payload; your wallet address is stored as an attribute so only your contracts appear in your retrieve panel.
