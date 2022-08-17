package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", index)
	log.Fatal(http.ListenAndServe(":80", nil))
}

func index(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintln(w, "<h1>Welcome to my website</h1>")
	fmt.Fprintln(w, "<h2>from "+getInstanceId()+"</h2>")
	azCode := getAz()
	if azCode == "a" {
		fmt.Fprintln(w, "<style>body {background-color: green}</style>")
	} else if azCode == "b" {
		fmt.Fprintln(w, "<style>body {background-color: blue}</style>")
	} else if azCode == "c" {
		fmt.Fprintln(w, "<style>body {background-color: orange}</style>")
	} else {
		fmt.Fprintln(w, "<style>body {background-color: red}</style>")
	}
}

func getAz() string {
	resp, _ := http.Get("http://169.254.169.254/latest/meta-data/placement/availability-zone")
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	stringBody := string(body)
	return stringBody[len(stringBody)-1:]
}

func getInstanceId() string {
	resp, _ := http.Get("http://169.254.169.254/latest/meta-data/instance-id")
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return string(body)
}
