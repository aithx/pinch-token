# Pinch

A Solana meme coin. One billion coins. Then the printer is destroyed.

- Nobody can mint more
- Nobody can freeze a wallet
- Nobody can change the name
- No sell tax
- Not for sale, and not on an exchange

This is a joke coin, not an investment. If it ever trades, you can lose all of the money.

## Create it on the free test network

```bash
cd ~/Desktop/Projects/pinch-token
npm install
npm test
npm run create
```

That asks Solana's test network for play money. It does not spend real SOL. The public faucet sometimes says "too many requests". Wait and run `npm run create` again. Nothing real was spent.

You get a coin address. All 1,000,000,000 Pinch coins sit in a test wallet on this Mac:

`keys/devnet-wallet.json`

That file is the key. Do not share it. It is not uploaded to GitHub.

Check the lock:

```bash
npm run verify
```

## Want a different name?

Edit `src/token.ts` before `npm run create`. After creation the name cannot be changed.

## Real Solana

Turned off. Creating it there spends real SOL, and you have not asked for that.
