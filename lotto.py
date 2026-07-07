import random


def generate_lotto_numbers():
    """1~45 중 중복 없이 6개를 뽑아 오름차순으로 반환"""
    return sorted(random.sample(range(1, 46), 6))


def main():
    try:
        count = int(input("몇 게임을 뽑을까요? (기본 5): ") or 5)
    except ValueError:
        count = 5

    print("\n=== 로또 번호 추첨 결과 ===")
    for i in range(1, count + 1):
        numbers = generate_lotto_numbers()
        formatted = " ".join(f"{n:2d}" for n in numbers)
        print(f"{i}번째 게임: {formatted}")


if __name__ == "__main__":
    main()
