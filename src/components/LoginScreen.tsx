import React, { useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";

interface LoginScreenProps {
  onLogin: () => void;
  status: string;
  isLoading: boolean;
}

export function LoginScreen({ onLogin, status, isLoading }: LoginScreenProps) {
  const { stdout } = useStdout();

  // Update terminal tab title for unauthenticated view
  useEffect(() => {
    if (!stdout) return;
    stdout.write("\x1b]0;Welcome to Groupchatty\x07");
  }, [stdout]);

  useInput((input, key) => {
    if (key.return && !isLoading) {
      onLogin();
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" padding={2}>
      <Box marginBottom={2}>
        <Text color="redBright" bold>
          {`
  ██████╗ ██████╗  ██████╗ ██╗   ██╗██████╗  ██████╗██╗  ██╗ █████╗ ████████╗████████╗██╗   ██╗
 ██╔════╝ ██╔══██╗██╔═══██╗██║   ██║██╔══██╗██╔════╝██║  ██║██╔══██╗╚══██╔══╝╚══██╔══╝╚██╗ ██╔╝
 ██║  ███╗██████╔╝██║   ██║██║   ██║██████╔╝██║     ███████║███████║   ██║      ██║    ╚████╔╝ 
 ██║   ██║██╔══██╗██║   ██║██║   ██║██╔═══╝ ██║     ██╔══██║██╔══██║   ██║      ██║     ╚██╔╝  
 ╚██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║     ╚██████╗██║  ██║██║  ██║   ██║      ██║      ██║   
  ╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝      ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝      ╚═╝      ╚═╝   
                                          G R O U P C H A T 
`}
        </Text>
      </Box>

      <Box
        borderStyle="single"
        borderColor="redBright"
        paddingX={4}
        paddingY={1}
        flexDirection="column"
        alignItems="center"
      >
        {isLoading ? (
          <>
            <Text color="yellow">{status || "Authenticating..."}</Text>
            <Box marginTop={1}>
              <Text color="gray">Please complete login in your browser...</Text>
            </Box>
          </>
        ) : status ? (
          <>
            <Text color="red">{status}</Text>
            <Box marginTop={1}>
              <Text color="gray">Press </Text>
              <Text color="cyan" bold>
                Enter
              </Text>
              <Text color="gray"> to try again</Text>
            </Box>
          </>
        ) : (
          <>
            <Text color="redBright">Welcome to Groupchat!</Text>
            <Box marginTop={1}>
              <Text color="gray">Press </Text>
              <Text color="green" bold>
                Enter
              </Text>
              <Text color="gray"> to login with your browser</Text>
            </Box>
          </>
        )}
      </Box>

      <Box marginTop={2}>
        <Text color="gray">Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}
