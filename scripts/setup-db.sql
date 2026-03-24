-- Grant privileges to "user" on outboundos
GRANT ALL PRIVILEGES ON DATABASE outboundos TO "user";
ALTER DATABASE outboundos OWNER TO "user";
SELECT 'Grants complete' AS status;
