#pragma once
#include <sys/socket.h>
#include <net/if.h>
#include <unistd.h>
int testSetsockopt(int, int, int, const void*, socklen_t);
int testBind(int, const sockaddr*, socklen_t);
#define setsockopt testSetsockopt
#define bind testBind
