using System.Text;
using System;
using System.Data;
using Microsoft.Data.Sqlite;
using System.Text.Json;

namespace POS_Demo
{
    internal class Database
    {
        // Path to your existing database
        private static string dbPath = @"C:\Users\Nethsara\source\repos\POS Demo\POS Demo\Database\Database.db";
        private static string connectionString = "Data Source=" + dbPath;

        // Check if profiles table exists
        public static bool ProfilesTableExists()
        {
            SqliteConnection connection = new SqliteConnection(connectionString);
            connection.Open();

            string sql = "SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'";
            SqliteCommand command = new SqliteCommand(sql, connection);

            SqliteDataReader reader = command.ExecuteReader();
            bool exists = reader.HasRows;

            reader.Close();
            command.Dispose();
            connection.Close();

            return exists;
        }

        public static DataTable GetProfiles()
        {
            DataTable dt = new DataTable();

            SqliteConnection connection = new SqliteConnection(connectionString);
            connection.Open();

            string sql = "SELECT Username, Name FROM profiles";
            SqliteCommand command = new SqliteCommand(sql, connection);

            SqliteDataReader reader = command.ExecuteReader();

            dt.Load(reader);

            reader.Close();
            command.Dispose();
            connection.Close();

            return dt;
        }

        public static string DataTableToJson(DataTable table)
        {
            StringBuilder json = new StringBuilder();
            json.Append("[");

            for (int i = 0; i < table.Rows.Count; i++)
            {
                json.Append("{");
                for (int j = 0; j < table.Columns.Count; j++)
                {
                    json.Append("\"")
                        .Append(table.Columns[j].ColumnName)
                        .Append("\":\"")
                        .Append(table.Rows[i][j].ToString().Replace("\"", "\\\""))
                        .Append("\"");

                    if (j < table.Columns.Count - 1)
                        json.Append(",");
                }
                json.Append("}");

                if (i < table.Rows.Count - 1)
                    json.Append(",");
            }

            json.Append("]");
            return json.ToString();
        }

        public static void SaveTrademarkToSQLite(JsonElement trademark)
        {
            //string dbPath = "Database.db";
            //string connStr = $"Data Source={dbPath}";

            using (var conn = new SqliteConnection(connectionString))
            {
                conn.Open();

                using (var cmd = conn.CreateCommand())
                {

                    // 1️⃣ Drop table if exists
                    cmd.CommandText = "DROP TABLE IF EXISTS trademark;";
                    cmd.ExecuteNonQuery();

                    // 2️⃣ Create table
                    cmd.CommandText = @"
        CREATE TABLE trademark (
            colour1 TEXT,
            colour2 TEXT,
            logoLink TEXT,
            mode TEXT
        );";
                    cmd.ExecuteNonQuery();

                    // 3️⃣ Insert data
                    cmd.CommandText = @"
        INSERT INTO trademark (colour1, colour2, logoLink, mode)
        VALUES (@c1, @c2, @logo, @mode);
    ";

                    cmd.Parameters.AddWithValue("@c1",
                        trademark.TryGetProperty("colour1", out var c1) ? c1.GetString() : null);

                    cmd.Parameters.AddWithValue("@c2",
                        trademark.TryGetProperty("colour2", out var c2) ? c2.GetString() : null);

                    cmd.Parameters.AddWithValue("@logo",
                        trademark.TryGetProperty("logoLink", out var logo) ? logo.GetString() : null);

                    cmd.Parameters.AddWithValue("@mode",
                        trademark.TryGetProperty("mode", out var mode) ? mode.GetString() : null);

                    cmd.ExecuteNonQuery();
                }
            }
        }

        public static void SaveOfflineBill(JsonElement bill)
        {
            using (SqliteConnection conn = new SqliteConnection(connectionString))
            {
                conn.Open();

                using (SqliteTransaction tx = conn.BeginTransaction())
                {
                    try
                    {
                        // =======================
                        // 0️⃣ CREATE TABLES IF NOT EXISTS
                        // =======================
                        using (SqliteCommand tableCmd = conn.CreateCommand())
                        {
                            tableCmd.Transaction = tx;

                            tableCmd.CommandText = @"
CREATE TABLE IF NOT EXISTS bills (
    billId TEXT PRIMARY KEY,
    firestoreDocId TEXT,
    storeId TEXT,
    cashierId TEXT,
    customerId TEXT,
    date TEXT,
    timestamp INTEGER,
    paymentMethod TEXT,
    paidAmount REAL,
    balance REAL,
    totalDiscount REAL,
    total REAL,
    syncStatus INTEGER
);

CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    billId TEXT,
    itemId TEXT,
    barcode TEXT,
    name TEXT,
    unitPrice REAL,
    quantity INTEGER,
    discount REAL,
    subtotal REAL,
    FOREIGN KEY (billId) REFERENCES bills(billId)
);
";
                            tableCmd.ExecuteNonQuery();
                        }

                        // =======================
                        // 1️⃣ INSERT BILL HEADER
                        // =======================
                        using (SqliteCommand billCmd = conn.CreateCommand())
                        {
                            billCmd.Transaction = tx;

                            billCmd.CommandText = @"
INSERT INTO bills
(billId, firestoreDocId, storeId, cashierId, customerId, date, timestamp,
 paymentMethod, paidAmount, balance, totalDiscount, total, syncStatus)
VALUES
(@billId, @firestoreDocId, @storeId, @cashierId, @customerId, @date, @timestamp,
 @paymentMethod, @paidAmount, @balance, @totalDiscount, @total, 0);
";

                            billCmd.Parameters.AddWithValue("@billId", bill.GetProperty("billId").GetString());
                            billCmd.Parameters.AddWithValue("@firestoreDocId", DBNull.Value);
                            billCmd.Parameters.AddWithValue("@storeId", bill.GetProperty("storeId").GetString());
                            billCmd.Parameters.AddWithValue("@cashierId", bill.GetProperty("cashierId").GetString());

                            object customerIdValue;

                            if (bill.TryGetProperty("customerId", out JsonElement c) &&
                                c.ValueKind != JsonValueKind.Null)
                            {
                                customerIdValue = c.GetString();
                            }
                            else
                            {
                                customerIdValue = DBNull.Value;
                            }

                            billCmd.Parameters.AddWithValue("@customerId", customerIdValue);


                            billCmd.Parameters.AddWithValue("@date", bill.GetProperty("date").GetString());
                            billCmd.Parameters.AddWithValue("@timestamp", bill.GetProperty("timestamp").GetInt64());
                            billCmd.Parameters.AddWithValue("@paymentMethod", bill.GetProperty("paymentMethod").GetString());
                            billCmd.Parameters.AddWithValue("@paidAmount", bill.GetProperty("paidAmount").GetDecimal());
                            billCmd.Parameters.AddWithValue("@balance", bill.GetProperty("balance").GetDecimal());
                            billCmd.Parameters.AddWithValue("@totalDiscount", bill.GetProperty("totalDiscount").GetDecimal());
                            billCmd.Parameters.AddWithValue("@total", bill.GetProperty("total").GetDecimal());

                            billCmd.ExecuteNonQuery();
                        }

                        // =======================
                        // 2️⃣ INSERT BILL ITEMS
                        // =======================
                        using (SqliteCommand itemCmd = conn.CreateCommand())
                        {
                            itemCmd.Transaction = tx;

                            itemCmd.CommandText = @"
INSERT INTO bill_items
(billId, itemId, barcode, name, unitPrice, quantity, discount, subtotal)
VALUES
(@billId, @itemId, @barcode, @name, @unitPrice, @quantity, @discount, @subtotal);
";

                            foreach (JsonElement item in bill.GetProperty("items").EnumerateArray())
                            {
                                itemCmd.Parameters.Clear();

                                itemCmd.Parameters.AddWithValue("@billId", bill.GetProperty("billId").GetString());
                                itemCmd.Parameters.AddWithValue("@itemId", item.GetProperty("itemId").GetString());
                                itemCmd.Parameters.AddWithValue("@barcode", item.GetProperty("barcode").GetString());
                                itemCmd.Parameters.AddWithValue("@name", item.GetProperty("name").GetString());
                                itemCmd.Parameters.AddWithValue("@unitPrice", item.GetProperty("unitPrice").GetDecimal());
                                itemCmd.Parameters.AddWithValue("@quantity", item.GetProperty("quantity").GetInt32());
                                itemCmd.Parameters.AddWithValue(
                                    "@discount",
                                    item.TryGetProperty("discount", out JsonElement d) &&
                                    d.ValueKind != JsonValueKind.Null
                                        ? d.GetDecimal()
                                        : 0m
                                );
                                itemCmd.Parameters.AddWithValue("@subtotal", item.GetProperty("subtotal").GetDecimal());

                                itemCmd.ExecuteNonQuery();
                            }
                        }

                        tx.Commit();
                    }
                    catch
                    {
                        tx.Rollback();
                        throw;
                    }
                }
            }
        }

        public static void UpdateStatus(string billId, string firestoreDocId)
        {
            using (SqliteConnection conn = new SqliteConnection(connectionString))
            {
                conn.Open();

                using (SqliteTransaction tx = conn.BeginTransaction())
                {
                    try
                    {
                        // 2️⃣ Update sync status
                        using (SqliteCommand cmd = conn.CreateCommand())
                        {
                            cmd.Transaction = tx;

                            cmd.CommandText = @"
UPDATE bills
SET syncStatus = 1,
    firestoreDocId = @firestoreDocId
WHERE billId = @billId AND syncStatus = 0;
";

                            cmd.Parameters.AddWithValue("@billId", billId);
                            cmd.Parameters.AddWithValue("@firestoreDocId", firestoreDocId);

                            cmd.ExecuteNonQuery();
                        }

                        tx.Commit();
                    }
                    catch
                    {
                        tx.Rollback();
                        throw;
                    }
                }
            }
        }



    }
}
