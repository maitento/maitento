"""A tiny command-line greeter, used as the starting point for the code pipeline tutorial."""
import argparse


def greeting(name: str) -> str:
    return f"Hello, {name}!"


def main() -> None:
    parser = argparse.ArgumentParser(description="Print a greeting.")
    parser.add_argument("name", help="who to greet")
    args = parser.parse_args()
    print(greeting(args.name))


if __name__ == "__main__":
    main()
