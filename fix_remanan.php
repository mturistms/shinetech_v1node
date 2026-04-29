<?php
$conn = new mysqli('localhost', 'root', '', 'shinetech');
if ($conn->connect_error)
    die($conn->connect_error);

echo "Attempting to fix remanan...\n";
$res = $conn->query("UPDATE staff SET designation = 'thozhilali' WHERE name LIKE '%remanan%'");
if ($res) {
    echo "Rows affected: " . $conn->affected_rows . "\n";
} else {
    echo "Error: " . $conn->error . "\n";
}

$res = $conn->query("SELECT id, name, designation FROM staff WHERE name LIKE '%remanan%'");
while ($row = $res->fetch_assoc()) {
    print_r($row);
}

$conn->close();
?>