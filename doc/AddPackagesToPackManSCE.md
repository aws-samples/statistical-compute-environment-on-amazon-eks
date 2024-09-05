# Adding Packages to SCE Posit 

Install Packages in Package Manager (Beta Manual)


### Variant A (direct Kubectl)



```
kubectl exec -it <your-rstudio-pod-name> -c rspm — /bin/bash
rspm create repo —name=cran —description='Access CRAN packages'
rspm subscribe —repo=cran —source=cran
rspm sync —type=cran
```


if you get an error like

```
Error from server (NotFound): pods "<yourpodname>" not found 
```

try Variant B

### Variant B


execute is step by step and add the namespace of the package manager

```
kubectl exec -ti <YOURPOD>  -- sh
```

this will open a shell inside Package Manager

in this shell execute (each command separately)

Set up a Repo for the Packages

```
rspm create repo --name=cran —description='Access CRAN packages'
```

Subscribe the repo to CRAN sources

```
rspm subscribe --repo=cran --source=cran
```


initialize a Sync


```
rspm sync —type=cran
```

You should see an output like this


```
Initiated CRAN synchronization for cran. Depending on how much data has been previously synchronized, this could take a while. Actions will appear in the Package Manager UI as they are completed.
```

You can go to the Package Manager UI and check for progress and see packages being added
[Image: Screenshot 2024-04-17 at 13.54.14.png]and after some time


```
CRAN synchronization complete.
```

