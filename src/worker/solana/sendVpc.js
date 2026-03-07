import bs58 from "bs58";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { config } from "../../runtime/config.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";

function loadKeypairFromEnv() {
  const raw = process.env.SOLANA_SENDER_SECRET || "";
  if (!raw) throw new Error("Missing SOLANA_SENDER_SECRET");

  if (raw.trim().startsWith("[")) {
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(new Uint8Array(arr));
  }
  return Keypair.fromSecretKey(bs58.decode(raw.trim()));
}

export async function sendVPC({ solanaRecipient, vpcAmount }) {
  const conn = new Connection(config.SOLANA_RPC_URL, "confirmed");
  const sender = loadKeypairFromEnv();

  const mint = new PublicKey(config.VPC_MINT);
  const recipient = new PublicKey(solanaRecipient);

  const senderAta = getAssociatedTokenAddressSync(mint, sender.publicKey, true);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient, true);

  const ix = [];
  const recipientAtaInfo = await conn.getAccountInfo(recipientAta);
  if (!recipientAtaInfo) {
    ix.push(
      createAssociatedTokenAccountInstruction(sender.publicKey, recipientAta, recipient, mint)
    );
  }

  const amountBaseUnits = BigInt(Math.floor(Number(vpcAmount) * 10 ** config.VPC_DECIMALS));

  ix.push(
    createTransferCheckedInstruction(
      senderAta,
      mint,
      recipientAta,
      sender.publicKey,
      amountBaseUnits,
      config.VPC_DECIMALS
    )
  );

  const tx = new Transaction().add(...ix);
  tx.feePayer = sender.publicKey;
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(sender);

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}
