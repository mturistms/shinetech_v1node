<?php
$conn = new mysqli('localhost', 'root', '', 'shinetech');
if ($conn->connect_error)
    die("Conn failed: " . $conn->connect_error);

$res = $conn->query("DESCRIBE staff");
$found = false;
while ($row = $res->fetch_assoc()) {
    if ($row['Field'] == 'designation') {
        file_put_contents('schema_result.txt', "Type: " . $row['Type']);
        $found = true;
    }
}
if (!$found) {
    file_put_contents('schema_result.txt', "Field not found");
}
$conn->close();
?>