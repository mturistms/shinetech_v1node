<?php
$conn = new mysqli('localhost', 'root', '', 'shinetech');
if ($conn->connect_error) {
    echo "Connection failed: " . $conn->connect_error;
    exit;
}

echo "Updating schema...\n";
$res1 = $conn->query("ALTER TABLE staff MODIFY designation VARCHAR(255) DEFAULT 'Employee'");
if ($res1) {
    echo "Schema updated successfully.\n";
} else {
    echo "Schema update failed: " . $conn->error . "\n";
}

echo "Checking data...\n";
$res2 = $conn->query("SELECT id, name, designation FROM staff");
while ($row = $res2->fetch_assoc()) {
    echo "ID: " . $row['id'] . " | Name: " . $row['name'] . " | Designation: [" . $row['designation'] . "]\n";
}

$conn->close();
?>
