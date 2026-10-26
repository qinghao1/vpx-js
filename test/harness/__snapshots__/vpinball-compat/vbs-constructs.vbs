Option Explicit
' VBS construct coverage fixture for the AST-parity gate (parity-script.ts)
' and the e2e transpile probe (demo-browser/e2e/integration.mjs).
' Exercises real transpiler paths: subs, functions, branches, loops,
' Select Case, arrays, string concat, bitwise/logical ops, With, Nothing.
cGameName = "twd_160h"

Const MaxBalls = 5
Dim score, bonus, playerName
Dim balls(4)

score = 0
playerName = "Player" & "1"

Sub AddScore(points)
	If points > 0 Then
		score = score + points
	ElseIf points = 0 Then
		score = score
	Else
		score = score - 1
	End If
End Sub

Function DoubleIt(n)
	DoubleIt = n * 2
End Function

Sub TestLoop()
	Dim i, total
	total = 0
	For i = 1 To 10 Step 2
		total = total + i
	Next
	Dim k
	k = 0
	Do While k < 3
		k = k + 1
	Loop
	Select Case total
		Case 1
			total = 10
		Case 2, 3
			total = 20
		Case Else
			total = 30
	End Select
End Sub

Sub TestLogic(a, b)
	Dim f
	f = (a And 7) Or (b Xor 3)
	If Not a Is Nothing Then
		f = f + 1
	End If
	If a = 1 And b = 2 Or f > 0 Then
		f = f * 2
	End If
End Sub

Sub TestWith(obj)
	With obj
		.X = 1
		.Y = 2
	End With
End Sub
