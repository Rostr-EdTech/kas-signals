"""Make an SVG QR code for the KAS donation address shown in the Donate dialog.

Usage:
    pip install qrcode            # once
    python3 tools/make_donation_qr.py kaspa:qr...your-address
Then set  donate.kasQr: "img/donate-kas.svg"  in js/config.js.
"""
import os
import sys

import qrcode
import qrcode.image.svg

if len(sys.argv) != 2 or not sys.argv[1].startswith("kaspa:"):
    sys.exit("Usage: python3 tools/make_donation_qr.py kaspa:<your address>")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "img", "donate-kas.svg")
os.makedirs(os.path.dirname(out), exist_ok=True)
img = qrcode.make(sys.argv[1], image_factory=qrcode.image.svg.SvgPathImage,
                  error_correction=qrcode.constants.ERROR_CORRECT_M, border=2)
img.save(out)
print(f"Wrote {os.path.normpath(out)}")
