import { Stack } from "expo-router";
import React from "react";

export default function ListingLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="[id]"
        options={{
          headerTitle: "",
          headerTransparent: true,
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}
