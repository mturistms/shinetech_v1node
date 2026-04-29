<?php
$conn = new mysqli('localhost', 'root', '', 'shinetech');
if ($conn->connect_error)
    die($conn->connect_error);

echo "Attempting to fix sagar...\n";
$res = $conn->query("UPDATE staff SET designation = 'Sr Techinican' WHERE name LIKE '%sagar%'");
if ($res) {
    echo "Rows affected: " . $conn->affected_rows . "\n";
} else {
    echo "Error: " . $conn->error . "\n";
}

$conn->close();
?>