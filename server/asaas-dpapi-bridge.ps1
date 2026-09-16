param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("protect","unprotect")]
    [string]$Mode,

    [Parameter(Mandatory=$true)]
    [string]$Value
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Security

if($Mode -eq "protect"){

    $raw =
        [Convert]::FromBase64String(
            $Value
        )

    try {

        $protected =
            [System.Security.Cryptography.ProtectedData]::Protect(
                $raw,
                $null,
                [System.Security.Cryptography.DataProtectionScope]::CurrentUser
            )

        [Console]::Out.Write(
            [Convert]::ToBase64String(
                $protected
            )
        )
    }
    finally {

        if($raw){
            [Array]::Clear(
                $raw,
                0,
                $raw.Length
            )
        }
    }

    exit 0
}

if($Mode -eq "unprotect"){

    $protected =
        [Convert]::FromBase64String(
            $Value
        )

    $raw =
        [System.Security.Cryptography.ProtectedData]::Unprotect(
            $protected,
            $null,
            [System.Security.Cryptography.DataProtectionScope]::CurrentUser
        )

    try {

        [Console]::Out.Write(
            [Convert]::ToBase64String(
                $raw
            )
        )
    }
    finally {

        if($raw){
            [Array]::Clear(
                $raw,
                0,
                $raw.Length
            )
        }
    }

    exit 0
}

exit 1
