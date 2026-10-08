import os

from dotenv import load_dotenv
from openai import OpenAI


# Load environment variables from .env
load_dotenv()

api_key = os.getenv("NEBIUS_API_KEY")

if not api_key:
    raise RuntimeError(
        "NEBIUS_API_KEY was not found. "
        "Make sure your .env file contains NEBIUS_API_KEY."
    )


# Connect to Nebius Token Factory
client = OpenAI(
    api_key=api_key,
    base_url="https://api.tokenfactory.nebius.com/v1/",
)


print("Connecting to Nebius Token Factory...")
print("Sending request to Nemotron...\n")


response = client.chat.completions.create(
    model="nvidia/Nemotron-3_5-Lightning",
    messages=[
        {
            "role": "system",
            "content": (
                "You are the reasoning engine for Prelight, "
                "an AI infrastructure change-safety system."
            ),
        },
        {
            "role": "user",
            "content": (
                "Reply with exactly this sentence: "
                "Prelight has successfully connected to Nemotron."
            ),
        },
    ],
    max_tokens=50,
)


print("==========================================")
print("        PRELIGHT - NEMOTRON TEST")
print("==========================================")
print(response.choices[0].message.content)
print("==========================================")