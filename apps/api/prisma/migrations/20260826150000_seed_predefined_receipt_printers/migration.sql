-- Make the six discovered LAN X-printers immediately selectable in the
-- catalog registry. Names are intentionally temporary and remain editable.
-- Existing operator-managed records for the same endpoint always win.
INSERT INTO "ReceiptPrinter" (
    "id",
    "name",
    "ipAddress",
    "port",
    "transport",
    "isActive",
    "updatedAt"
)
VALUES
    (
        md5('receipt-printer:192.168.123.100:9100')::uuid,
        'Аппарат 1',
        '192.168.123.100',
        9100,
        'RAW_TCP'::"ReceiptPrinterTransport",
        true,
        CURRENT_TIMESTAMP
    ),
    (
        md5('receipt-printer:192.168.123.101:9100')::uuid,
        'Аппарат 2',
        '192.168.123.101',
        9100,
        'RAW_TCP'::"ReceiptPrinterTransport",
        true,
        CURRENT_TIMESTAMP
    ),
    (
        md5('receipt-printer:192.168.123.105:9100')::uuid,
        'Аппарат 3',
        '192.168.123.105',
        9100,
        'RAW_TCP'::"ReceiptPrinterTransport",
        true,
        CURRENT_TIMESTAMP
    ),
    (
        md5('receipt-printer:192.168.0.4:9100')::uuid,
        'Аппарат 4',
        '192.168.0.4',
        9100,
        'RAW_TCP'::"ReceiptPrinterTransport",
        true,
        CURRENT_TIMESTAMP
    ),
    (
        md5('receipt-printer:192.168.0.86:9100')::uuid,
        'Аппарат 5',
        '192.168.0.86',
        9100,
        'RAW_TCP'::"ReceiptPrinterTransport",
        true,
        CURRENT_TIMESTAMP
    ),
    (
        md5('receipt-printer:192.168.0.87:9100')::uuid,
        'Аппарат 6',
        '192.168.0.87',
        9100,
        'RAW_TCP'::"ReceiptPrinterTransport",
        true,
        CURRENT_TIMESTAMP
    )
ON CONFLICT ("ipAddress", "port") DO NOTHING;
