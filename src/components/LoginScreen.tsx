import React from "react";
import { Box, Text, useInput } from "ink";

interface LoginScreenProps {
  onLogin: () => void;
  status: string;
  isLoading: boolean;
}

export function LoginScreen({ onLogin, status, isLoading }: LoginScreenProps) {
  useInput((input, key) => {
    if (key.return && !isLoading) {
      onLogin();
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" padding={2}>
      <Box marginBottom={2}>
        <Text color="blue" bold>
          {`
  ████████╗███████╗██████╗ ███╗   ███╗██╗███╗   ██╗ █████╗ ██╗
  ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║██║████╗  ██║██╔══██╗██║
     ██║   █████╗  ██████╔╝██╔████╔██║██║██╔██╗ ██║███████║██║
     ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║██║██║╚██╗██║██╔══██║██║
     ██║   ███████╗██║  ██║██║ ╚═╝ ██║██║██║ ╚████║██║  ██║███████╗
     ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
                           ██████╗██╗  ██╗ █████╗ ████████╗
                          ██╔════╝██║  ██║██╔══██╗╚══██╔══╝
                          ██║     ███████║███████║   ██║
                          ██║     ██╔══██║██╔══██║   ██║
                          ╚██████╗██║  ██║██║  ██║   ██║
                           ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
`}
        </Text>
      </Box>

      <Box
        borderStyle="single"
        borderColor="blue"
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
            <Text color="white">Welcome to Terminal Chat!</Text>
            <Box marginTop={1}>
              <Text color="gray">Press </Text>
              <Text color="cyan" bold>
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
